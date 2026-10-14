/**
 * Housekeeping for transient security tables. Run daily (cron / systemd timer): `npm run maintenance`.
 * Deletes ONLY expired sessions, used/expired reset tokens and old login-attempt rows.
 * It never touches audit, observation, request or staff data (those are append-only / protected by DB triggers).
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const db = new PrismaClient();
  const now = new Date();
  const day = 86_400_000;
  const s = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const t = await db.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } });
  const l = await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * day) } } });
  console.log(`sessions=${s.count} resetTokens=${t.count} loginAttempts=${l.count}`);
  await db.$disconnect();
}
main().catch((e) => { console.error("maintenance failed", (e as { code?: string }).code ?? "unknown"); process.exit(1); });
