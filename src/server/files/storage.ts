import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { sniffImageType } from "@/lib/image-sniff";

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export class FileRejectedError extends Error {}

const KEY_RE = /^[A-Za-z0-9_-]{2}\/[A-Za-z0-9_-]{20,}\.jpg$/;

function resolveKey(key: string): string {
  if (!KEY_RE.test(key)) throw new Error("Bad storage key");
  const root = path.resolve(env().FILE_STORAGE_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Bad storage key");
  return full;
}

/**
 * Validates, re-encodes (strips EXIF/GPS and any embedded payload, normalises orientation, 600×600 JPEG)
 * and stores a profile photo under a random key in private storage. Returns the FileAsset id.
 */
export async function storeProfilePhoto(file: File, ctx: { ownerStaffId: string; uploadedById: string }): Promise<{ id: string }> {
  if (file.size === 0) throw new FileRejectedError("No file selected.");
  if (file.size > MAX_PHOTO_BYTES) throw new FileRejectedError("Photograph must be 3 MB or smaller.");
  const input = new Uint8Array(await file.arrayBuffer());
  if (!sniffImageType(input)) throw new FileRejectedError("Photograph must be a JPEG, PNG or WebP image.");

  let out: Buffer;
  try {
    out = await sharp(input, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate()
      .resize(600, 600, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new FileRejectedError("That image could not be processed. Try a different file.");
  }

  const token = randomToken(24);
  const storageKey = `${token.slice(0, 2)}/${token.slice(2)}.jpg`;
  const full = resolveKey(storageKey);
  await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await writeFile(full, out, { flag: "wx", mode: 0o600 });
  try {
    const asset = await db.fileAsset.create({
      data: {
        purpose: "PROFILE_PHOTO", storageKey, mimeType: "image/jpeg", sizeBytes: out.length, sha256: sha256Hex(out.toString("base64")),
        ownerStaffId: ctx.ownerStaffId, uploadedById: ctx.uploadedById,
      },
      select: { id: true },
    });
    return asset;
  } catch (e) {
    await unlink(full).catch(() => undefined);
    throw e;
  }
}

export const readStoredFile = (storageKey: string) => readFile(resolveKey(storageKey));
