"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/authz";
import { ForbiddenError } from "@/server/authz/policy";
import { requestContext } from "@/server/auth/context";
import { ImportError, cancelBatch, commitBatch, createBatch, saveMapping, validateBatch } from "@/server/import/service";
import { ImportFileError } from "@/server/import/xlsx";
import { cancelObservationImport, ObservationConflictError, ObservationValidationError } from "@/server/observation/service";
import { commitObservationWorkbook, uploadObservationWorkbook } from "@/server/import/observations";
import { purgeImportSource } from "@/server/import/files";

export interface ImportState { error?: string; ok?: string }
const id = z.string().min(1).max(40);

function fail(e: unknown): ImportState {
  if (e instanceof ForbiddenError) notFound();
  if (e instanceof ImportError || e instanceof ImportFileError || e instanceof ObservationValidationError || e instanceof ObservationConflictError) return { error: e.message };
  console.error("import failed", (e as { code?: string }).code ?? "unknown"); // never log row content
  return { error: "Something went wrong. Please try again." };
}

export async function uploadAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireUser();
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return { error: "Choose an .xlsx file." };
  let batchId: string;
  try { batchId = (await createBatch(user, f, (await requestContext()).ip)).id; } catch (e) { return fail(e); }
  redirect(`/import/${batchId}`);
}

export async function mappingAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireUser();
  const batchId = id.safeParse(fd.get("id"));
  if (!batchId.success) notFound();
  const map: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("map:") && typeof v === "string") map[k.slice(4)] = v;
  try {
    const ip = (await requestContext()).ip;
    await saveMapping(user, batchId.data, map, ip);
    await validateBatch(user, batchId.data, ip);
  } catch (e) { return fail(e); }
  revalidatePath(`/import/${batchId.data}`);
  return { ok: "Mapped and validated." };
}

export async function commitAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireUser();
  const batchId = id.safeParse(fd.get("id"));
  if (!batchId.success) notFound();
  try {
    const r = await commitBatch(user, batchId.data, (await requestContext()).ip);
    revalidatePath(`/import/${batchId.data}`);
    return { ok: `Imported ${r.committed} staff record(s)${r.skipped ? `, ${r.skipped} skipped` : ""}.` };
  } catch (e) { return fail(e); }
}

export async function cancelAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireUser();
  const batchId = id.safeParse(fd.get("id"));
  if (!batchId.success) notFound();
  try { await cancelBatch(user, batchId.data, (await requestContext()).ip); } catch (e) { return fail(e); }
  revalidatePath(`/import/${batchId.data}`);
  return { ok: "Import cancelled." };
}

/* Leader-only observation migration */
export async function obsUploadAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireUser();
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return { error: "Choose an .xlsx file." };
  let batchId: string;
  try { batchId = (await uploadObservationWorkbook(user, f, (await requestContext()).ip)).id; } catch (e) { return fail(e); }
  redirect(`/import/observations/${batchId}`);
}

export async function obsCommitAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireUser();
  const batchId = id.safeParse(fd.get("id"));
  if (!batchId.success) notFound();
  try {
    const r = await commitObservationWorkbook(user, batchId.data, (await requestContext()).ip);
    revalidatePath(`/import/observations/${batchId.data}`);
    return { ok: `Migrated ${r.committed} observation(s)${r.skipped ? `, ${r.skipped} skipped` : ""}.` };
  } catch (e) { return fail(e); }
}

export async function obsCancelAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireUser();
  const batchId = id.safeParse(fd.get("id"));
  if (!batchId.success) notFound();
  try {
    const fileId = await cancelObservationImport(user, batchId.data, (await requestContext()).ip);
    if (fileId) await purgeImportSource(fileId);
  } catch (e) { return fail(e); }
  revalidatePath(`/import/observations/${batchId.data}`);
  return { ok: "Cancelled. Staged text removed." };
}
