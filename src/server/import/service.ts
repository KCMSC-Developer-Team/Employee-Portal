import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { staffCreateSchema } from "@/lib/validation/staff";
import { ForbiddenError, scopeFor, type AuthUser } from "@/server/authz/policy";
import { staffCreateData } from "@/server/staff/mutations";
import { REQUIRED_KEYS, TARGETS, suggestMapping, validateMapping } from "./catalog";
import { purgeImportSource, readImportSource, storeImportSource } from "./files";
import { normalizeRow, csvCell, type RefLookup, type RowIssue } from "./normalize";
import { ImportFileError, assertXlsx, parseWorkbook } from "./xlsx";

/**
 * Staff-profile Excel import. Pipeline: upload → map columns → validate (stage rows + issues, nothing written to
 * staff tables) → commit (one transaction) → reconcile. Never imports passwords; only MAPPED columns are read from
 * the workbook; existing staff IDs are never overwritten or merged (reported as DUPLICATE/CONFLICT for manual action).
 */
export class ImportError extends Error {}

export function assertImporter(user: AuthUser): void {
  if (scopeFor(user, "import:run") !== "ALL" || scopeFor(user, "staff:create") !== "ALL") throw new ForbiddenError();
}

interface MappingDoc { headers: string[]; map: Record<string, string> }
const asMapping = (j: Prisma.JsonValue | null): MappingDoc | null => {
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as { headers?: unknown; map?: unknown };
  if (!Array.isArray(o.headers) || !o.map || typeof o.map !== "object") return null;
  return { headers: o.headers.map(String), map: o.map as Record<string, string> };
};

const BATCH_SELECT = {
  id: true, originalName: true, status: true, columnMapping: true, totalRows: true, committedRows: true, createdAt: true,
  fileAssetId: true, createdBy: { select: { staffMember: { select: { name: true } } } },
} satisfies Prisma.ImportBatchSelect;

export async function listBatches(user: AuthUser) {
  assertImporter(user);
  return db.importBatch.findMany({
    where: { includesObservations: false }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, originalName: true, status: true, totalRows: true, committedRows: true, createdAt: true },
  });
}

export async function getBatch(user: AuthUser, id: string) {
  assertImporter(user);
  const b = await db.importBatch.findFirst({ where: { id, includesObservations: false }, select: BATCH_SELECT });
  if (!b) return null;
  return { ...b, mapping: asMapping(b.columnMapping) };
}

const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "import.xlsx";

export async function createBatch(user: AuthUser, file: File, ip: string | null): Promise<{ id: string }> {
  assertImporter(user);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertXlsx(bytes);
  const sheet = await parseWorkbook(bytes, { headersOnly: true });
  const headers = sheet.headers.filter(Boolean);
  const asset = await storeImportSource(bytes, user.id);
  const batch = await db.$transaction(async (tx) => {
    const b = await tx.importBatch.create({
      data: {
        fileAssetId: asset.id, originalName: safeName(file.name), createdById: user.id, includesObservations: false,
        columnMapping: { headers, map: suggestMapping(headers) },
      },
      select: { id: true },
    });
    await audit(tx, { actorId: user.id, action: "import.upload", entityType: "ImportBatch", entityId: b.id, metadata: { columns: headers.length }, ip });
    return b;
  });
  return batch;
}

export async function saveMapping(user: AuthUser, id: string, map: Record<string, string>, ip: string | null): Promise<void> {
  assertImporter(user);
  const b = await db.importBatch.findFirst({ where: { id, includesObservations: false }, select: { status: true, columnMapping: true } });
  if (!b) throw new ImportError("Import not found.");
  if (!["UPLOADED", "MAPPED", "VALIDATED"].includes(b.status)) throw new ImportError("This import can no longer be changed.");
  const doc = asMapping(b.columnMapping);
  if (!doc) throw new ImportError("Import has no column information.");
  const clean: Record<string, string> = {};
  for (const h of doc.headers) clean[h] = typeof map[h] === "string" ? map[h]! : "";
  const err = validateMapping(clean);
  if (err) throw new ImportError(err);

  await db.$transaction(async (tx) => {
    await tx.importRow.deleteMany({ where: { batchId: id } });
    await tx.importRowIssue.deleteMany({ where: { batchId: id } });
    await tx.importBatch.update({ where: { id }, data: { columnMapping: { headers: doc.headers, map: clean }, status: "MAPPED", totalRows: 0 } });
    await audit(tx, { actorId: user.id, action: "import.map", entityType: "ImportBatch", entityId: id, ip });
  });
}

type StagedRow = { rowNumber: number; staffIdKey: string | null; data: Prisma.InputJsonValue; status: "VALID" | "INVALID" | "DUPLICATE" | "CONFLICT"; matchedStaffId: string | null };
type StagedIssue = { rowNumber: number | null; column: string | null; code: string; severity: "ERROR" | "WARNING"; message: string };

const COMPARE: Array<[string, string]> = [
  ["name", "Name"], ["designationId", "Designation"], ["categoryId", "Joined as"], ["departmentId", "Department"],
  ["subject", "Subject"], ["mobile", "Mobile"], ["email", "Email"], ["maritalStatus", "Marital status"],
  ["bloodGroup", "Blood group"], ["homeDistrict", "Home district"], ["nidOrPassport", "NID/Passport"],
  ["presentAddress", "Present address"], ["permanentAddress", "Permanent address"], ["joiningDate", "Joining date"], ["dateOfBirth", "Date of birth"],
];
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function validateBatch(user: AuthUser, id: string, ip: string | null): Promise<{ valid: number; invalid: number; duplicate: number; conflict: number }> {
  assertImporter(user);
  const b = await db.importBatch.findFirst({ where: { id, includesObservations: false }, select: { status: true, columnMapping: true, fileAssetId: true } });
  if (!b) throw new ImportError("Import not found.");
  if (!["MAPPED", "VALIDATED"].includes(b.status)) throw new ImportError("Map the columns first.");
  const doc = asMapping(b.columnMapping);
  if (!doc || validateMapping(doc.map)) throw new ImportError("Map the columns first.");

  const bytes = await readImportSource(b.fileAssetId);
  if (!bytes) throw new ImportError("The uploaded file is no longer available. Upload it again.");
  let sheet;
  try { sheet = await parseWorkbook(bytes); } catch (e) {
    if (e instanceof ImportFileError) throw new ImportError(e.message);
    throw e;
  }

  // Only mapped columns are ever read out of the sheet.
  const colIndex = new Map<string, number>(); // target key → column index
  sheet.headers.forEach((h, i) => { const t = doc.map[h]; if (t) colIndex.set(t, i); });
  if (REQUIRED_KEYS.some((k) => !colIndex.has(k))) throw new ImportError("The file's columns no longer match the mapping. Re-map the columns.");

  const [designations, categories, departments, existing] = await Promise.all([
    db.designation.findMany({ select: { id: true, name: true } }),
    db.employmentCategory.findMany({ select: { id: true, name: true } }),
    db.department.findMany({ select: { id: true, name: true } }),
    db.staffMember.findMany({
      take: 100_000,
      select: {
        id: true, staffId: true, name: true, designationId: true, categoryId: true, departmentId: true, subject: true, mobile: true,
        email: true, maritalStatus: true, bloodGroup: true, homeDistrict: true, nidOrPassport: true, presentAddress: true,
        permanentAddress: true, joiningDate: true, dateOfBirth: true,
      },
    }),
  ]);
  const toMap = (l: Array<{ id: string; name: string }>) => new Map(l.map((x) => [x.name.trim().toLowerCase(), x.id]));
  const refs: RefLookup = { designation: toMap(designations), category: toMap(categories), department: toMap(departments) };

  const byStaffId = new Map(existing.map((e) => [e.staffId.toLowerCase(), e]));
  const byNid = new Map(existing.flatMap((e) => (e.nidOrPassport ? [[e.nidOrPassport.toUpperCase(), e] as const] : [])));
  const byEmail = new Map(existing.flatMap((e) => (e.email ? [[e.email.toLowerCase(), e] as const] : [])));
  const byMobile = new Map(existing.flatMap((e) => (e.mobile ? [[e.mobile, e] as const] : [])));

  const rows: StagedRow[] = [];
  const issues: StagedIssue[] = [];
  const seenId = new Set<string>(), seenNid = new Set<string>(), seenEmail = new Set<string>(), seenMobile = new Set<string>();

  for (const r of sheet.rows) {
    const raw: Record<string, string> = {};
    for (const [key, idx] of colIndex) raw[key] = r.cells[idx] ?? "";
    const n = normalizeRow(raw, refs);
    const add = (i: RowIssue, severity: "ERROR" | "WARNING" = "ERROR") => issues.push({ rowNumber: r.rowNumber, ...i, severity });
    const push = (status: StagedRow["status"], matched: string | null = null, data: Prisma.InputJsonValue = {}) =>
      rows.push({ rowNumber: r.rowNumber, staffIdKey: n.staffIdKey, status, matchedStaffId: matched, data });

    n.issues.forEach((i) => add(i));
    if (!n.data || !n.form) { push("INVALID"); continue; }

    const key = n.staffIdKey!;
    if (seenId.has(key)) { add({ column: "Staff ID", code: "DUPLICATE_IN_FILE", message: "This staff ID appears earlier in the file." }); push("DUPLICATE"); continue; }
    seenId.add(key);

    const ex = byStaffId.get(key);
    if (ex) {
      const diffs = COMPARE.filter(([f]) => {
        const fileV = (n.data as unknown as Record<string, string | null>)[f];
        if (fileV === null || fileV === undefined) return false; // blank file cell never counts as a change
        const cur = (ex as unknown as Record<string, unknown>)[f];
        return (cur instanceof Date ? ymd(cur) : cur) !== fileV;
      }).map(([, l]) => l);
      if (diffs.length === 0) {
        add({ column: "Staff ID", code: "ALREADY_EXISTS", message: "Staff ID already exists with identical data. Skipped." }, "WARNING");
        push("DUPLICATE", ex.id);
      } else {
        add({ column: "Staff ID", code: "CONFLICT", message: `Staff ID already exists and differs in: ${diffs.join(", ")}. Not imported; resolve manually.` });
        push("CONFLICT", ex.id);
      }
      continue;
    }

    const nid = n.data.nidOrPassport;
    if (nid) {
      const other = byNid.get(nid);
      if (other || seenNid.has(nid)) {
        add({ column: "NID/Passport", code: "NID_CONFLICT", message: "This NID/passport already belongs to another staff record." });
        push("CONFLICT", other?.id ?? null);
        continue;
      }
      seenNid.add(nid);
    }
    if (n.data.email && (byEmail.has(n.data.email) || seenEmail.has(n.data.email))) add({ column: "Email", code: "SHARED_EMAIL", message: "Email is already used by another staff record." }, "WARNING");
    if (n.data.mobile && (byMobile.has(n.data.mobile) || seenMobile.has(n.data.mobile))) add({ column: "Mobile", code: "SHARED_MOBILE", message: "Mobile number is already used by another staff record." }, "WARNING");
    if (n.data.email) seenEmail.add(n.data.email);
    if (n.data.mobile) seenMobile.add(n.data.mobile);

    push("VALID", null, n.form as Prisma.InputJsonValue);
  }

  await db.$transaction(async (tx) => {
    await tx.importRow.deleteMany({ where: { batchId: id } });
    await tx.importRowIssue.deleteMany({ where: { batchId: id } });
    for (let i = 0; i < rows.length; i += 500) await tx.importRow.createMany({ data: rows.slice(i, i + 500).map((r) => ({ ...r, batchId: id })) });
    for (let i = 0; i < issues.length; i += 500) await tx.importRowIssue.createMany({ data: issues.slice(i, i + 500).map((x) => ({ ...x, batchId: id })) });
    await tx.importBatch.update({ where: { id }, data: { status: "VALIDATED", totalRows: rows.length } });
    await audit(tx, { actorId: user.id, action: "import.validate", entityType: "ImportBatch", entityId: id, metadata: { rows: rows.length, issues: issues.length }, ip });
  }, { timeout: 120_000 });

  const c = (s: StagedRow["status"]) => rows.filter((r) => r.status === s).length;
  return { valid: c("VALID"), invalid: c("INVALID"), duplicate: c("DUPLICATE"), conflict: c("CONFLICT") };
}

/** Writes every VALID row in ONE transaction (all-or-nothing). Rows are re-validated at commit time. */
export async function commitBatch(user: AuthUser, id: string, ip: string | null): Promise<{ committed: number; skipped: number }> {
  assertImporter(user);
  const result = await db.$transaction(async (tx) => {
    const claim = await tx.importBatch.updateMany({ where: { id, includesObservations: false, status: "VALIDATED" }, data: { status: "COMMITTED" } });
    if (claim.count === 0) throw new ImportError("This import is not ready to commit (already committed, or not validated).");

    const rows = await tx.importRow.findMany({ where: { batchId: id, status: "VALID" }, orderBy: { rowNumber: "asc" }, select: { id: true, rowNumber: true, data: true } });
    if (rows.length === 0) throw new ImportError("There are no valid rows to import.");
    const have = new Set((await tx.staffMember.findMany({ select: { staffId: true } })).map((s) => s.staffId.toLowerCase()));

    let committed = 0, skipped = 0;
    for (const r of rows) {
      const parsed = staffCreateSchema.safeParse(r.data);
      const late = parsed.success && have.has(parsed.data.staffId.toLowerCase());
      if (!parsed.success || late) {
        skipped++;
        await tx.importRow.update({ where: { id: r.id }, data: { status: "SKIPPED", data: {} } });
        await tx.importRowIssue.create({ data: { batchId: id, rowNumber: r.rowNumber, column: "Staff ID", severity: "ERROR", code: late ? "LATE_DUPLICATE" : "REVALIDATION_FAILED", message: late ? "Staff ID was created by someone else after validation." : "Row no longer passes validation." } });
        continue;
      }
      const staff = await tx.staffMember.create({ data: staffCreateData(parsed.data), select: { id: true } });
      have.add(parsed.data.staffId.toLowerCase());
      await tx.importRow.update({ where: { id: r.id }, data: { status: "COMMITTED", data: {}, matchedStaffId: staff.id } }); // personal data cleared from staging
      await audit(tx, { actorId: user.id, action: "staff.import", entityType: "StaffMember", entityId: staff.id, metadata: { batchId: id }, ip });
      committed++;
    }
    await tx.importRow.updateMany({ where: { batchId: id, status: { in: ["INVALID", "DUPLICATE", "CONFLICT"] } }, data: { data: {} } });
    await tx.importBatch.update({ where: { id }, data: { committedRows: committed } });
    await audit(tx, { actorId: user.id, action: "import.commit", entityType: "ImportBatch", entityId: id, metadata: { committed, skipped }, ip });
    return { committed, skipped };
  }, { isolationLevel: "Serializable", timeout: 180_000 });

  const b = await db.importBatch.findUnique({ where: { id }, select: { fileAssetId: true } });
  if (b) await purgeImportSource(b.fileAssetId);
  return result;
}

export async function cancelBatch(user: AuthUser, id: string, ip: string | null): Promise<void> {
  assertImporter(user);
  const b = await db.importBatch.findFirst({ where: { id, includesObservations: false }, select: { status: true, fileAssetId: true } });
  if (!b) throw new ImportError("Import not found.");
  if (b.status === "COMMITTED") throw new ImportError("A committed import cannot be cancelled.");
  await db.$transaction(async (tx) => {
    await tx.importRow.deleteMany({ where: { batchId: id } });
    await tx.importBatch.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, { actorId: user.id, action: "import.cancel", entityType: "ImportBatch", entityId: id, ip });
  });
  await purgeImportSource(b.fileAssetId);
}

export async function listIssues(user: AuthUser, id: string, limit = 200) {
  assertImporter(user);
  const batch = await db.importBatch.findFirst({ where: { id, includesObservations: false }, select: { id: true } });
  if (!batch) return [];
  return db.importRowIssue.findMany({
    where: { batchId: id }, orderBy: [{ rowNumber: "asc" }, { createdAt: "asc" }], take: limit,
    select: { rowNumber: true, column: true, code: true, severity: true, message: true },
  });
}

export async function issuesCsv(user: AuthUser, id: string): Promise<string | null> {
  assertImporter(user);
  const batch = await db.importBatch.findFirst({ where: { id, includesObservations: false }, select: { id: true } });
  if (!batch) return null;
  const rows = await listIssues(user, id, 100_000);
  const head = ["row", "field", "severity", "code", "message"].join(",");
  return "﻿" + [head, ...rows.map((r) => [r.rowNumber, r.column, r.severity, r.code, r.message].map(csvCell).join(","))].join("\r\n") + "\r\n";
}

/** Reconciliation: staging counts must add up, and committed rows must really exist in the staff table. */
export async function reconcile(user: AuthUser, id: string) {
  assertImporter(user);
  const b = await db.importBatch.findFirst({ where: { id, includesObservations: false }, select: { totalRows: true, committedRows: true, status: true } });
  if (!b) return null;
  const grouped = await db.importRow.groupBy({ by: ["status"], where: { batchId: id }, _count: { _all: true } });
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Record<string, number>;
  const sum = Object.values(counts).reduce((t, n) => t + n, 0);
  const committedRows = await db.importRow.findMany({ where: { batchId: id, status: "COMMITTED" }, select: { matchedStaffId: true } });
  const ids = committedRows.flatMap((r) => (r.matchedStaffId ? [r.matchedStaffId] : []));
  const inDb = ids.length ? await db.staffMember.count({ where: { id: { in: ids } } }) : 0;
  return {
    status: b.status, totalRows: b.totalRows, counts, accountedFor: sum === b.totalRows,
    committed: b.committedRows, verifiedInDatabase: inDb, committedMatches: inDb === b.committedRows && ids.length === b.committedRows,
  };
}

export const MAPPING_TARGETS = TARGETS.map((t) => ({ key: t.key, label: t.label, required: !!t.required }));
