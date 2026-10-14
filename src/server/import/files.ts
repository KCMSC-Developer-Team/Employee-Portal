import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256Hex } from "@/lib/crypto";

const KEY_RE = /^imp\/[A-Za-z0-9_-]{24,}\.xlsx$/;

function resolveKey(key: string): string {
  if (!KEY_RE.test(key)) throw new Error("Bad storage key");
  const root = path.resolve(env().FILE_STORAGE_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Bad storage key");
  return full;
}

/** Stores the uploaded workbook privately under a random name. Never served over HTTP (the file route serves photos only). */
export async function storeImportSource(bytes: Uint8Array, uploadedById: string): Promise<{ id: string }> {
  const storageKey = `imp/${randomToken(24)}.xlsx`;
  const full = resolveKey(storageKey);
  await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await writeFile(full, bytes, { flag: "wx", mode: 0o600 });
  try {
    return await db.fileAsset.create({
      data: {
        purpose: "IMPORT_SOURCE", storageKey, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: bytes.length, sha256: sha256Hex(Buffer.from(bytes).toString("base64")), uploadedById,
      },
      select: { id: true },
    });
  } catch (e) {
    await unlink(full).catch(() => undefined);
    throw e;
  }
}

export async function readImportSource(fileAssetId: string): Promise<Uint8Array | null> {
  const a = await db.fileAsset.findUnique({ where: { id: fileAssetId }, select: { storageKey: true, purpose: true } });
  if (!a || a.purpose !== "IMPORT_SOURCE") return null;
  try { return new Uint8Array(await readFile(resolveKey(a.storageKey))); } catch { return null; }
}

/** Personal data minimisation: the source workbook is deleted from disk once the batch is committed or cancelled. */
export async function purgeImportSource(fileAssetId: string): Promise<void> {
  const a = await db.fileAsset.findUnique({ where: { id: fileAssetId }, select: { storageKey: true, purpose: true } });
  if (!a || a.purpose !== "IMPORT_SOURCE") return;
  await unlink(resolveKey(a.storageKey)).catch(() => undefined);
}
