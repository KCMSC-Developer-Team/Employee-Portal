import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { PermissionKey } from "@/lib/permissions";
import { ForbiddenError, can, canGrantRole, canGrantRoleFull, type AuthUser } from "@/server/authz/policy";

export const ROLES_PAGE_SIZE = 25;

/** Anyone who may grant at least one class of role. */
export const canManageRoles = (u: AuthUser) => can(u, "role:assign:ordinary") || can(u, "leader:grant");

export async function listRoleCatalog() {
  const roles = await db.role.findMany({
    orderBy: { name: "asc" },
    select: { id: true, key: true, name: true, isLeader: true, permissions: { select: { permission: { select: { key: true } } } } },
  });
  return roles.map((r) => ({ id: r.id, key: r.key, name: r.name, isLeader: r.isLeader, permissions: r.permissions.map((p) => p.permission.key as PermissionKey) }));
}
export type RoleCatalogEntry = Awaited<ReturnType<typeof listRoleCatalog>>[number];

export async function listAccountsWithRoles(actor: AuthUser, f: { q?: string; page: number }) {
  if (!canManageRoles(actor)) throw new ForbiddenError();
  const where = {
    staffMember: f.q
      ? { is: { OR: [{ name: { contains: f.q, mode: "insensitive" as const } }, { staffId: { contains: f.q, mode: "insensitive" as const } }] } }
      : { isNot: null },
  };
  const [total, rows] = await db.$transaction([
    db.userAccount.count({ where }),
    db.userAccount.findMany({
      where, orderBy: { staffMember: { name: "asc" } }, skip: (f.page - 1) * ROLES_PAGE_SIZE, take: ROLES_PAGE_SIZE,
      select: {
        id: true, accountStatus: true, staffMember: { select: { staffId: true, name: true } },
        roles: { select: { id: true, department: { select: { name: true } }, role: { select: { key: true, name: true, isLeader: true } } } },
      },
    }),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / ROLES_PAGE_SIZE)) };
}

export type RoleResult = { ok: true } | { ok: false; error: string };

export async function grantRole(actor: AuthUser, targetUserId: string, roleId: string, departmentId: string | null, ip: string | null): Promise<RoleResult> {
  const role = await db.role.findUnique({
    where: { id: roleId }, select: { id: true, key: true, isLeader: true, permissions: { select: { permission: { select: { key: true } } } } },
  });
  if (!role) return { ok: false, error: "Role not found." };
  const perms = role.permissions.map((p) => p.permission.key as PermissionKey);
  if (!canGrantRoleFull(actor, targetUserId, { isLeader: role.isLeader, permissions: perms })) {
    return { ok: false, error: "You are not allowed to grant this role to this account." };
  }
  const target = await db.userAccount.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!target) return { ok: false, error: "Account not found." };
  if (departmentId && !(await db.department.findUnique({ where: { id: departmentId }, select: { id: true } }))) {
    return { ok: false, error: "Department not found." };
  }
  try {
    await db.$transaction(async (tx) => {
      await tx.userRole.create({ data: { userId: targetUserId, roleId: role.id, departmentId, grantedById: actor.id } });
      await audit(tx, {
        actorId: actor.id, action: "role.grant", entityType: "UserAccount", entityId: targetUserId,
        metadata: { roleKey: role.key, departmentId: departmentId ?? "all" }, ip,
      });
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "That role is already assigned with this scope." };
    throw e;
  }
  return { ok: true };
}

/** Revoke follows the same rule as grant (no self-changes; Leader roles need `leader:grant`). */
export async function revokeRole(actor: AuthUser, userRoleId: string, ip: string | null): Promise<RoleResult> {
  const ur = await db.userRole.findUnique({
    where: { id: userRoleId }, select: { id: true, userId: true, departmentId: true, role: { select: { key: true, isLeader: true } } },
  });
  if (!ur) return { ok: false, error: "Assignment not found." };
  if (!canGrantRole(actor, ur.userId, ur.role)) return { ok: false, error: "You are not allowed to revoke this role." };

  try {
    return await db.$transaction(async (tx) => {
      // Never leave the institution without an institution-wide Leader (race-safe under Serializable).
      if (ur.role.isLeader && ur.departmentId === null) {
        const remaining = await tx.userRole.count({ where: { role: { isLeader: true }, departmentId: null } });
        if (remaining <= 1) return { ok: false as const, error: "At least one institution-wide Leader must remain." };
      }
      await tx.userRole.delete({ where: { id: ur.id } });
      await audit(tx, {
        actorId: actor.id, action: "role.revoke", entityType: "UserAccount", entityId: ur.userId,
        metadata: { roleKey: ur.role.key, departmentId: ur.departmentId ?? "all" }, ip,
      });
      return { ok: true as const };
    }, { isolationLevel: "Serializable" });
  } catch (e) {
    if ((e as { code?: string }).code === "P2034") return { ok: false, error: "Conflicting change — please try again." };
    throw e;
  }
}
