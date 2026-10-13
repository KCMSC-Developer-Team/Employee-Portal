import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { audit } from "../../lib/audit";
import { generateTempPassword } from "../../lib/crypto";
import type { PermissionKey } from "../../lib/permissions";
import { canManageAccount, type AuthUser } from "../authz/policy";
import { hashPassword } from "./password";

/**
 * Creates the login account for a staff member with a RANDOM one-time password.
 * The plaintext is returned once to the caller (shown to the admin) and is never stored or logged.
 */
export async function provisionAccount(
  tx: Prisma.TransactionClient,
  staffMemberId: string,
): Promise<{ userId: string; temporaryPassword: string }> {
  const temporaryPassword = generateTempPassword();
  const user = await tx.userAccount.create({
    data: {
      staffMemberId,
      passwordHash: await hashPassword(temporaryPassword),
      accountStatus: "PENDING_ACTIVATION",
      mustChangePassword: true,
    },
    select: { id: true },
  });
  return { userId: user.id, temporaryPassword };
}

export type ResetResult = { ok: true; temporaryPassword: string } | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" };

/** Admin-issued account recovery. Subject to the anti-escalation rule in canManageAccount (admins cannot reset Leaders). */
export async function resetCredential(actor: AuthUser, targetUserId: string, ip: string | null): Promise<ResetResult> {
  const target = await db.userAccount.findUnique({
    where: { id: targetUserId },
    select: { roles: { select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } } } },
  });
  if (!target) return { ok: false, error: "NOT_FOUND" };

  const targetPerms = target.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key as PermissionKey));
  if (!canManageAccount(actor, targetUserId, targetPerms)) return { ok: false, error: "FORBIDDEN" };

  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await db.$transaction(async (tx) => {
    await tx.userAccount.update({
      where: { id: targetUserId },
      data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
    });
    await tx.session.deleteMany({ where: { userId: targetUserId } });
    await audit(tx, { actorId: actor.id, action: "account.credential_reset", entityType: "UserAccount", entityId: targetUserId, ip });
  });
  return { ok: true, temporaryPassword };
}
