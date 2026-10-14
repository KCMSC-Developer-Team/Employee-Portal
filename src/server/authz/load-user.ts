import { db } from "@/lib/db";
import type { PermissionKey } from "@/lib/permissions";
import type { AuthUser, Grant } from "./policy";

/** Builds the AuthUser (with all grants) straight from the DB. No cookies/session logic — also used by tests. */
export async function loadAuthUser(userId: string, sessionId: string): Promise<AuthUser | null> {
  const acct = await db.userAccount.findUnique({
    where: { id: userId },
    select: {
      id: true,
      accountStatus: true,
      mustChangePassword: true,
      staffMember: { select: { id: true, staffId: true, name: true, departmentId: true } },
      roles: {
        select: {
          departmentId: true,
          role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } },
        },
      },
    },
  });
  if (!acct || (acct.accountStatus !== "ACTIVE" && acct.accountStatus !== "PENDING_ACTIVATION")) return null;

  const grants: Grant[] = acct.roles.flatMap((ur) =>
    ur.role.permissions.map((rp) => ({ permission: rp.permission.key as PermissionKey, departmentId: ur.departmentId })),
  );
  return {
    id: acct.id,
    sessionId,
    staffMemberId: acct.staffMember?.id ?? null,
    staffId: acct.staffMember?.staffId ?? null,
    name: acct.staffMember?.name ?? "System account",
    departmentId: acct.staffMember?.departmentId ?? null,
    mustChangePassword: acct.mustChangePassword,
    roleKeys: [...new Set(acct.roles.map((r) => r.role.key))],
    grants,
  };
}
