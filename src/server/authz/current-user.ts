import { cache } from "react";
import { db } from "@/lib/db";
import type { PermissionKey } from "@/lib/permissions";
import { readSession } from "@/server/auth/session";
import type { AuthUser, Grant } from "./policy";

/** Loads the session's user with all grants from the DB on every request (revocations take effect immediately). */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const acct = await db.userAccount.findUnique({
    where: { id: session.userId },
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
    sessionId: session.sessionId,
    staffMemberId: acct.staffMember?.id ?? null,
    staffId: acct.staffMember?.staffId ?? null,
    name: acct.staffMember?.name ?? "System account",
    departmentId: acct.staffMember?.departmentId ?? null,
    mustChangePassword: acct.mustChangePassword,
    roleKeys: [...new Set(acct.roles.map((r) => r.role.key))],
    grants,
  };
});
