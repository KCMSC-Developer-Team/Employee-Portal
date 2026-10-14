/**
 * Pure authorization policy (no I/O) — unit-testable and the only place permission logic lives.
 * Rules:
 *  - A grant with departmentId=null is institution-wide; otherwise it applies to that department only.
 *  - can(user, p) without a scope is true ONLY for institution-wide grants (conservative).
 *  - Ordinary permissions never imply Leader permissions; they are different keys.
 */
import type { PermissionKey } from "../../lib/permissions";

export interface Grant {
  permission: PermissionKey;
  departmentId: string | null;
}

export interface AuthUser {
  id: string;
  sessionId: string;
  staffMemberId: string | null;
  staffId: string | null;
  name: string;
  departmentId: string | null;
  mustChangePassword: boolean;
  roleKeys: string[];
  grants: Grant[];
}

export interface Scope {
  departmentId?: string | null;
}

export function can(user: AuthUser, permission: PermissionKey, scope?: Scope): boolean {
  return user.grants.some(
    (g) =>
      g.permission === permission &&
      (g.departmentId === null ||
        (scope?.departmentId != null && g.departmentId === scope.departmentId)),
  );
}

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

/** Defence in depth inside services: throws if the actor lacks the permission (for this scope). */
export function assertCan(user: AuthUser, permission: PermissionKey, scope?: Scope): void {
  if (!can(user, permission, scope)) throw new ForbiddenError();
}

/** "ALL" (institution-wide grant) or the department ids the user's grants cover (possibly empty). */
export function scopeFor(user: AuthUser, permission: PermissionKey): "ALL" | string[] {
  const gs = user.grants.filter((g) => g.permission === permission);
  if (gs.some((g) => g.departmentId === null)) return "ALL";
  return [...new Set(gs.flatMap((g) => (g.departmentId ? [g.departmentId] : [])))];
}

export interface ObservationTarget {
  staffMemberId: string;
  departmentId: string | null;
}

/** Employee concerned, or a Leader whose grant covers the target's department. Ordinary admins: never. */
export function canViewObservation(user: AuthUser, target: ObservationTarget): boolean {
  if (user.staffMemberId !== null && user.staffMemberId === target.staffMemberId) return true;
  return can(user, "observation:read", { departmentId: target.departmentId });
}

/** Employees can never write (not even their own). A Leader cannot write their own observation. */
export function canWriteObservation(user: AuthUser, target: ObservationTarget): boolean {
  if (user.staffMemberId !== null && user.staffMemberId === target.staffMemberId) return false;
  return can(user, "observation:write", { departmentId: target.departmentId });
}

/** No self-grants. Leader roles need the Leader-class `leader:grant`; ordinary roles need `role:assign:ordinary`. */
export function canGrantRole(actor: AuthUser, targetUserId: string, role: { isLeader: boolean }): boolean {
  if (actor.id === targetUserId) return false;
  return role.isLeader ? can(actor, "leader:grant") : can(actor, "role:assign:ordinary");
}

/**
 * Credential reset / enable / disable of another account. Anti-escalation: the actor must already hold
 * every permission the target holds, so an ordinary admin can never take over a Leader (or a stronger admin).
 */
export function canManageAccount(actor: AuthUser, targetUserId: string, targetPermissions: PermissionKey[]): boolean {
  if (actor.id === targetUserId) return false; // use the self-service change-password flow
  if (!can(actor, "account:manage")) return false;
  return targetPermissions.every((p) => can(actor, p));
}

/**
 * Full role-grant rule used by the role service. No self-grants. Leader roles need `leader:grant`
 * (Leader-class). Ordinary roles need `role:assign:ordinary` AND the granter must already hold every
 * permission in the role (no privilege escalation by handing out something stronger than your own).
 */
export function canGrantRoleFull(
  actor: AuthUser, targetUserId: string, role: { isLeader: boolean; permissions: PermissionKey[] },
): boolean {
  if (!canGrantRole(actor, targetUserId, role)) return false;
  return role.isLeader ? true : role.permissions.every((p) => can(actor, p));
}
