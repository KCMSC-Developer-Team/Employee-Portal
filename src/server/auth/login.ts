import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import type { AuthUser } from "@/server/authz/policy";
import { dummyHash, hashPassword, validateNewPassword, verifyPassword } from "./password";
import { isRateLimited, loginKeys, passwordChangeKey, recordAttempt } from "./rate-limit";
import { createSession, destroyCurrentSession, revokeUserSessions, type RequestContext } from "./session";

export type LoginResult =
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; error: "INVALID" | "RATE_LIMITED" };

/**
 * Staff ID + password. Unknown ID, wrong password, disabled and locked accounts are indistinguishable to the caller.
 * Automatic lockout is time-based (`lockedUntil`); AccountStatus.LOCKED/DISABLED require an admin action.
 */
export async function login(rawStaffId: string, password: string, ctx: RequestContext): Promise<LoginResult> {
  const staffId = rawStaffId.trim();
  const keys = loginKeys(staffId, ctx.ip);
  if (await isRateLimited(keys)) return { ok: false, error: "RATE_LIMITED" };

  const account = await db.userAccount.findFirst({
    where: { staffMember: { staffId } },
    select: {
      id: true, passwordHash: true, accountStatus: true,
      failedLoginCount: true, lockedUntil: true, mustChangePassword: true,
    },
  });

  // Always verify against some hash so timing doesn't reveal whether the staff ID exists.
  const passwordOk = await verifyPassword(account?.passwordHash ?? (await dummyHash()), password);
  const now = new Date();
  const timeLocked = !!account?.lockedUntil && account.lockedUntil > now;
  const statusOk = account?.accountStatus === "ACTIVE" || account?.accountStatus === "PENDING_ACTIVATION";

  if (account && passwordOk && statusOk && !timeLocked) {
    await db.userAccount.update({
      where: { id: account.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    await recordAttempt(keys, true);
    await createSession(account.id, ctx);
    await audit(db, { actorId: account.id, action: "auth.login", entityType: "UserAccount", entityId: account.id, ip: ctx.ip });
    return { ok: true, mustChangePassword: account.mustChangePassword };
  }

  await recordAttempt(keys, false);
  if (account && !timeLocked) {
    const failures = account.failedLoginCount + 1;
    const lock = failures >= env().LOGIN_MAX_FAILURES;
    await db.userAccount.update({
      where: { id: account.id },
      data: lock
        ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + env().LOGIN_LOCK_MINUTES * 60_000) }
        : { failedLoginCount: failures },
    });
    if (lock) {
      await audit(db, { actorId: null, action: "auth.lockout", entityType: "UserAccount", entityId: account.id, ip: ctx.ip });
    }
  }
  return { ok: false, error: "INVALID" };
}

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/** Self-service change (also the forced first-login change). Requires the current password; revokes all other sessions. */
export async function changePassword(
  user: AuthUser,
  currentPassword: string,
  newPassword: string,
  ctx: RequestContext,
): Promise<ChangePasswordResult> {
  const limit = [passwordChangeKey(user.id)];
  if (await isRateLimited(limit)) return { ok: false, error: "Too many attempts. Try again later." };

  const account = await db.userAccount.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, accountStatus: true, staffMember: { select: { mobile: true } } },
  });
  if (!account) return { ok: false, error: "Account not found." };

  if (!(await verifyPassword(account.passwordHash, currentPassword))) {
    await recordAttempt(limit, false);
    return { ok: false, error: "Current password is incorrect." };
  }
  if (newPassword === currentPassword) return { ok: false, error: "New password must differ from the current one." };
  const policyError = validateNewPassword(newPassword, [user.staffId, account.staffMember?.mobile]);
  if (policyError) return { ok: false, error: policyError };

  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.userAccount.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        ...(account.accountStatus === "PENDING_ACTIVATION" ? { accountStatus: "ACTIVE" as const } : {}),
      },
    });
    await tx.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
    await audit(tx, { actorId: user.id, action: "auth.password_change", entityType: "UserAccount", entityId: user.id, ip: ctx.ip });
  });
  await recordAttempt(limit, true);
  return { ok: true };
}

export async function logout(user: AuthUser | null, ctx: RequestContext): Promise<void> {
  await destroyCurrentSession();
  if (user) await audit(db, { actorId: user.id, action: "auth.logout", entityType: "UserAccount", entityId: user.id, ip: ctx.ip });
}

export { revokeUserSessions };
