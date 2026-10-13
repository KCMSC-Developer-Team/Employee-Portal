import { hash, verify } from "@node-rs/argon2";

// Argon2id (the library default algorithm), OWASP-minimum parameters: 19 MiB, 2 passes, 1 lane.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, OPTS);

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** Hash verified when the account does not exist, so response time doesn't reveal valid staff IDs. */
export const dummyHash = () => (dummy ??= hash("kcmsc-timing-equaliser", OPTS));

/** Returns an error message, or null if acceptable. `forbidden` = values the password must not contain (staff ID, phone). */
export function validateNewPassword(password: string, forbidden: Array<string | null | undefined> = []): string | null {
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (password.length > 128) return "Password must be at most 128 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password must contain letters and digits.";
  if (/^(.)\1+$/.test(password)) return "Password is too simple.";
  const lower = password.toLowerCase();
  for (const f of forbidden) {
    const v = f?.trim().toLowerCase();
    if (v && v.length >= 4 && lower.includes(v)) return "Password must not contain your staff ID or phone number.";
  }
  return null;
}
