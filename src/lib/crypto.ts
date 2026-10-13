import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { env } from "./env";

export const sha256Hex = (v: string) => createHash("sha256").update(v).digest("hex");

/** Keyed hash for rate-limit keys and IP hashes, so raw identifiers are never stored. */
export const hmacHex = (v: string) => createHmac("sha256", env().APP_SECRET).update(v).digest("hex");

/** Opaque URL-safe random token (session cookie, reset token). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

// No look-alike characters (0/O, 1/l/I). 55 symbols × 14 chars ≈ 81 bits of entropy.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateTempPassword(length = 14): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET.charAt(randomInt(ALPHABET.length));
  return out;
}
