import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { audit } from "../../lib/audit";
import { generateTempPassword } from "../../lib/crypto";
import type { PermissionKey } from "../../lib/permissions";
import { assertCan, canManageAccount, type AuthUser } from "../authz/policy";
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

async function targetPermissions(userId: string) {
  const t = await db.userAccount.findUnique({
    where: { id: userId },
    select: {
      passwordChangedAt: true,
      roles: { select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } } },
    },
  });
  if (!t) return null;
  return { passwordChangedAt: t.passwordChangedAt, perms: t.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key as PermissionKey)) };
}

/** Enable/disable a login account (independent of employment status). Same anti-escalation rule as resets. */
export async function setAccountStatus(
  actor: AuthUser, targetUserId: string, to: "ACTIVE" | "DISABLED", ip: string | null,
): Promise<{ ok: true } | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" }> {
  const t = await targetPermissions(targetUserId);
  if (!t) return { ok: false, error: "NOT_FOUND" };
  if (!canManageAccount(actor, targetUserId, t.perms)) return { ok: false, error: "FORBIDDEN" };
  await db.$transaction(async (tx) => {
    await tx.userAccount.update({
      where: { id: targetUserId },
      data: {
        accountStatus: to === "DISABLED" ? "DISABLED" : t.passwordChangedAt ? "ACTIVE" : "PENDING_ACTIVATION",
        failedLoginCount: 0, lockedUntil: null,
      },
    });
    if (to === "DISABLED") await tx.session.deleteMany({ where: { userId: targetUserId } });
    await audit(tx, { actorId: actor.id, action: to === "DISABLED" ? "account.disable" : "account.enable", entityType: "UserAccount", entityId: targetUserId, ip });
  });
  return { ok: true };
}

/** Login account for an existing staff member who has none. Random one-time password, returned once. */
export async function createAccountForStaff(actor: AuthUser, staffMemberId: string, ip: string | null) {
  assertCan(actor, "account:manage");
  return db.$transaction(async (tx) => {
    const staff = await tx.staffMember.findUnique({ where: { id: staffMemberId }, select: { id: true, account: { select: { id: true } } } });
    if (!staff) return { ok: false as const, error: "NOT_FOUND" as const };
    if (staff.account) return { ok: false as const, error: "EXISTS" as const };
    const { userId, temporaryPassword } = await provisionAccount(tx, staffMemberId);
    await audit(tx, { actorId: actor.id, action: "account.create", entityType: "UserAccount", entityId: userId, ip });
    return { ok: true as const, temporaryPassword };
  });
}
