import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hmacHex } from "@/lib/crypto";

export interface LimitKey {
  key: string;
  max: number;
}

/** Keys are HMACs, never raw staff IDs or IPs. IP key is looser (shared NAT) and only used when the IP is trusted/known. */
export function loginKeys(staffId: string, ip: string | null): LimitKey[] {
  const max = env().LOGIN_MAX_FAILURES;
  const keys: LimitKey[] = [{ key: `acct:${hmacHex(staffId.toLowerCase())}`, max }];
  if (ip) keys.push({ key: `ip:${hmacHex(ip)}`, max: max * 4 });
  return keys;
}

export const passwordChangeKey = (userId: string): LimitKey => ({
  key: `pw:${userId}`,
  max: env().LOGIN_MAX_FAILURES,
});

export async function isRateLimited(keys: LimitKey[]): Promise<boolean> {
  const since = new Date(Date.now() - env().LOGIN_WINDOW_MINUTES * 60_000);
  for (const k of keys) {
    const failures = await db.loginAttempt.count({ where: { key: k.key, success: false, createdAt: { gte: since } } });
    if (failures >= k.max) return true;
  }
  return false;
}

export async function recordAttempt(keys: LimitKey[], success: boolean): Promise<void> {
  await db.loginAttempt.createMany({ data: keys.map((k) => ({ key: k.key, success })) });
  if (success) {
    // A successful login clears that key's failure window.
    await db.loginAttempt.deleteMany({ where: { key: { in: keys.map((k) => k.key) }, success: false } });
  }
  if (Math.random() < 0.01) {
    await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
  }
}
