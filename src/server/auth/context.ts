import { headers } from "next/headers";
import { env } from "@/lib/env";
import type { RequestContext } from "./session";

/**
 * Client IP is only taken from X-Forwarded-For when TRUST_PROXY=true (i.e. behind your own reverse proxy
 * that overwrites the header). Otherwise it is unknown and only per-account limits apply.
 */
export async function requestContext(): Promise<RequestContext> {
  const h = await headers();
  let ip: string | null = null;
  if (env().TRUST_PROXY) {
    const xff = h.get("x-forwarded-for");
    ip = xff?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  }
  return { ip, userAgent: h.get("user-agent") };
}
