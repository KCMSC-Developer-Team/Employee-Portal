import { cache } from "react";
import { readSession } from "@/server/auth/session";
import { loadAuthUser } from "./load-user";
import type { AuthUser } from "./policy";

/** Grants are re-read from the DB on every request, so revocations take effect immediately. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await readSession();
  if (!session) return null;
  return loadAuthUser(session.userId, session.sessionId);
});
