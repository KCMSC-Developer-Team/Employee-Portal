import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { hmacHex, randomToken, sha256Hex } from "@/lib/crypto";
import { mailEnabled, sendMail } from "@/lib/mail";
import { hashPassword, validateNewPassword } from "./password";
import { isRateLimited, recordAttempt, type LimitKey } from "./rate-limit";
import type { RequestContext } from "./session";

const TOKEN_TTL_MIN = 30;

function keys(staffId: string, ip: string | null): LimitKey[] {
  const max = env().LOGIN_MAX_FAILURES;
  const k: LimitKey[] = [{ key: `rec:${hmacHex(staffId.toLowerCase())}`, max }];
  if (ip) k.push({ key: `recip:${hmacHex(ip)}`, max: max * 4 });
  return k;
}

/**
 * Always returns silently — the caller shows the same message whether or not an account/email exists.
 * Every request counts toward the rate limit. The link is sent only to the email already on file.
 */
export async function requestPasswordRecovery(rawStaffId: string, ctx: RequestContext): Promise<void> {
  if (!mailEnabled()) return;
  const staffId = rawStaffId.trim().slice(0, 64);
  if (!staffId) return;
  const k = keys(staffId, ctx.ip);
  if (await isRateLimited(k)) return;
  await recordAttempt(k, false);

  const acct = await db.userAccount.findFirst({
    where: { staffMember: { staffId, email: { not: null } }, accountStatus: { in: ["ACTIVE", "PENDING_ACTIVATION"] } },
    select: { id: true, staffMember: { select: { email: true } } },
  });
  const to = acct?.staffMember?.email;
  if (!acct || !to) return;

  const token = randomToken(32);
  await db.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({ where: { userId: acct.id, usedAt: null } }); // only the newest link works
    await tx.passwordResetToken.create({
      data: { tokenHash: sha256Hex(token), userId: acct.id, expiresAt: new Date(Date.now() + TOKEN_TTL_MIN * 60_000) },
    });
    await audit(tx, { actorId: null, action: "auth.recovery_requested", entityType: "UserAccount", entityId: acct.id, ip: ctx.ip });
  });

  const link = `${env().APP_URL}/reset-password?token=${token}`;
  // Not awaited: response time must not reveal whether the account exists. Failures log a code only.
  void sendMail(
    to,
    "KCMSC staff portal — password reset",
    `A password reset was requested for your staff account.\n\nOpen this link within ${TOKEN_TTL_MIN} minutes:\n${link}\n\nIf you did not ask for this, ignore this email — your password is unchanged.`,
  ).catch(() => console.error("recovery mail failed"));
}

export async function resetPasswordWithToken(
  token: string, newPassword: string, ctx: RequestContext,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const bad = { ok: false as const, error: "This reset link is invalid or has expired." };
  if (token.length < 20 || token.length > 200) return bad;
  const rk: LimitKey[] = ctx.ip ? [{ key: `recip:${hmacHex(ctx.ip)}`, max: env().LOGIN_MAX_FAILURES * 4 }] : [];
  if (rk.length && (await isRateLimited(rk))) return { ok: false, error: "Too many attempts. Try again later." };

  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: { id: true, userId: true, usedAt: true, expiresAt: true, user: { select: { accountStatus: true, staffMember: { select: { staffId: true, mobile: true } } } } },
  });
  if (!row || row.usedAt || row.expiresAt <= new Date() || !["ACTIVE", "PENDING_ACTIVATION"].includes(row.user.accountStatus)) {
    if (rk.length) await recordAttempt(rk, false);
    return bad;
  }
  const policy = validateNewPassword(newPassword, [row.user.staffMember?.staffId, row.user.staffMember?.mobile]);
  if (policy) return { ok: false, error: policy };

  const passwordHash = await hashPassword(newPassword);
  try {
    await db.$transaction(async (tx) => {
      const used = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count === 0) throw new Error("TOKEN_USED"); // lost a race: single use
      await tx.userAccount.update({
        where: { id: row.userId },
        data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null, accountStatus: "ACTIVE" },
      });
      await tx.session.deleteMany({ where: { userId: row.userId } });
      await audit(tx, { actorId: row.userId, action: "auth.password_reset", entityType: "UserAccount", entityId: row.userId, ip: ctx.ip });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "TOKEN_USED") return bad;
    throw e;
  }
  return { ok: true };
}
