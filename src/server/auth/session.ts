import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hmacHex, randomToken, sha256Hex } from "@/lib/crypto";

const PROD = process.env.NODE_ENV === "production";
// __Host- prefix: Secure, path=/, no Domain — prevents subdomain cookie injection.
export const SESSION_COOKIE = PROD ? "__Host-kcmsc_session" : "kcmsc_session";

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

/** Creates a fresh session (new token every login → no session fixation) and sets the cookie. Server actions/route handlers only. */
export async function createSession(userId: string, ctx: RequestContext): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3_600_000);
  await db.session.create({
    data: {
      tokenHash: sha256Hex(token),
      userId,
      expiresAt,
      ipHash: ctx.ip ? hmacHex(ctx.ip) : null,
      userAgent: ctx.userAgent?.slice(0, 255) ?? null,
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: PROD,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export interface ActiveSession {
  sessionId: string;
  userId: string;
}

/** Validates the cookie against the DB: absolute expiry + idle timeout. Read-only w.r.t. cookies (safe in server components). */
export async function readSession(): Promise<ActiveSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256Hex(token) } });
  if (!s) return null;
  const now = Date.now();
  const idleMs = env().SESSION_IDLE_MINUTES * 60_000;
  if (s.expiresAt.getTime() <= now || now - s.lastSeenAt.getTime() > idleMs) {
    await db.session.deleteMany({ where: { id: s.id } });
    return null;
  }
  if (now - s.lastSeenAt.getTime() > 60_000) {
    await db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date(now) } });
  }
  return { sessionId: s.id, userId: s.userId };
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256Hex(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function revokeUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await db.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}
