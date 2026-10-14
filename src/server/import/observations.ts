import { ForbiddenError, can, type AuthUser } from "@/server/authz/policy";
import { ObservationValidationError, commitObservationImport, stageObservationImport } from "@/server/observation/service";
import { normHeader } from "./catalog";
import { purgeImportSource, storeImportSource } from "./files";
import { ImportFileError, assertXlsx, parseWorkbook } from "./xlsx";

/**
 * Leader-only migration workbook: exactly two columns by heading — "Staff ID" and "Observation".
 * This file only parses and stores; the observation text goes straight into the Observation service's staging.
 * Ordinary administrators (import:run) can never reach this path: it requires `observation:import`.
 */
const ID_HEADERS = new Set(["staff id", "id no", "id", "employee id"]);

export async function uploadObservationWorkbook(user: AuthUser, file: File, ip: string | null) {
  if (!can(user, "observation:import")) throw new ForbiddenError();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let sheet;
  try {
    assertXlsx(bytes);
    sheet = await parseWorkbook(bytes);
  } catch (e) {
    if (e instanceof ImportFileError) throw new ObservationValidationError(e.message);
    throw e;
  }
  const idCol = sheet.headers.findIndex((h) => ID_HEADERS.has(normHeader(h)));
  const textCol = sheet.headers.findIndex((h) => normHeader(h) === "observation");
  if (idCol < 0 || textCol < 0) throw new ObservationValidationError('The workbook needs the headings "Staff ID" and "Observation".');

  const asset = await storeImportSource(bytes, user.id);
  try {
    const res = await stageObservationImport(user, {
      fileAssetId: asset.id, originalName: file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "observations.xlsx", ip,
      rows: sheet.rows.map((r) => ({ rowNumber: r.rowNumber, staffId: r.cells[idCol] ?? "", body: r.cells[textCol] ?? "" })),
    });
    await purgeImportSource(asset.id); // text now lives only in the Leader-restricted staging table
    return res;
  } catch (e) {
    await purgeImportSource(asset.id);
    throw e;
  }
}

export async function commitObservationWorkbook(user: AuthUser, batchId: string, ip: string | null) {
  const res = await commitObservationImport(user, batchId, ip);
  await purgeImportSource(res.fileAssetId);
  return { committed: res.committed, skipped: res.skipped };
}
