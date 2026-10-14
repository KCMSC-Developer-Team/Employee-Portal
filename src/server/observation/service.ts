/**
 * THE ONLY module allowed to touch the LeaderObservation /
 * ObservationRevision tables. A static security test enforces this. Every function re-checks authorization
 * itself — callers (pages, actions) are never trusted.
 *
 * Rules: employee = read own only; Leader = read/write within scope, never their own; ordinary admin = nothing.
 * No delete exists anywhere. Audit rows carry ids and version numbers, never text.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  ForbiddenError, can, canViewObservation, canWriteObservation, scopeFor, type AuthUser,
} from "@/server/authz/policy";

export class ObservationConflictError extends Error {}
export class ObservationValidationError extends Error {}

const bodySchema = z.string().trim().min(1, "Observation cannot be empty.").max(10_000, "Observation is too long (10,000 characters max).");
export const OBSERVATION_PAGE_SIZE = 25;

const staffTarget = (id: string) =>
  db.staffMember.findUnique({ where: { id }, select: { id: true, staffId: true, name: true, departmentId: true } });

export interface ObservationView { body: string; version: number; updatedAt: Date }

export type ReadResult =
  | { allowed: false }
  | { allowed: true; staff: { id: string; staffId: string; name: string; departmentId: string | null }; observation: ObservationView | null };

/** Employee concerned or in-scope Leader. Anything else → { allowed: false } (callers render a 404). */
export async function readObservation(user: AuthUser, staffMemberId: string, ip: string | null = null): Promise<ReadResult> {
  const t = await staffTarget(staffMemberId);
  if (!t || !canViewObservation(user, { staffMemberId: t.id, departmentId: t.departmentId })) return { allowed: false };

  const obs = await db.leaderObservation.findUnique({
    where: { staffMemberId: t.id }, select: { id: true, body: true, version: true, updatedAt: true },
  });
  // Leader views of someone else's observation are audited (id only). Self-views are not.
  if (obs && user.staffMemberId !== t.id) {
    await audit(db, { actorId: user.id, action: "observation.view", entityType: "LeaderObservation", entityId: obs.id, metadata: { staffMemberId: t.id }, ip });
  }
  return { allowed: true, staff: t, observation: obs ? { body: obs.body, version: obs.version, updatedAt: obs.updatedAt } : null };
}

/** Employee portal: the target is the session's own staff member, never a client-supplied id. */
export async function readOwnObservation(user: AuthUser) {
  if (!user.staffMemberId) return { allowed: false as const };
  return readObservation(user, user.staffMemberId);
}

/**
 * Create or edit. `expectedVersion` is 0 when no observation exists yet. Optimistic concurrency: a stale version
 * throws ObservationConflictError. Every successful write appends an immutable revision. There is no delete.
 */
export async function saveObservation(
  user: AuthUser, staffMemberId: string, rawBody: string, expectedVersion: number, ip: string | null,
): Promise<{ version: number }> {
  const t = await staffTarget(staffMemberId);
  if (!t || !canWriteObservation(user, { staffMemberId: t.id, departmentId: t.departmentId })) throw new ForbiddenError();

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) throw new ObservationValidationError(parsed.error.issues[0]?.message ?? "Invalid observation.");
  const body = parsed.data;

  try {
    return await db.$transaction(async (tx) => {
      const cur = await tx.leaderObservation.findUnique({ where: { staffMemberId: t.id }, select: { id: true, version: true, body: true } });

      if (!cur) {
        if (expectedVersion !== 0) throw new ObservationConflictError("This observation changed. Reload and try again.");
        const created = await tx.leaderObservation.create({
          data: { staffMemberId: t.id, body, version: 1, createdById: user.id, updatedById: user.id },
          select: { id: true },
        });
        await tx.observationRevision.create({ data: { observationId: created.id, version: 1, body, editedById: user.id } });
        await audit(tx, { actorId: user.id, action: "observation.create", entityType: "LeaderObservation", entityId: created.id, metadata: { staffMemberId: t.id, version: 1 }, ip });
        return { version: 1 };
      }

      if (cur.version !== expectedVersion) throw new ObservationConflictError("This observation was changed by someone else. Reload and try again.");
      if (cur.body === body) return { version: cur.version }; // nothing to record

      const next = cur.version + 1;
      const r = await tx.leaderObservation.updateMany({
        where: { id: cur.id, version: cur.version }, data: { body, version: next, updatedById: user.id },
      });
      if (r.count === 0) throw new ObservationConflictError("This observation was changed by someone else. Reload and try again.");
      await tx.observationRevision.create({ data: { observationId: cur.id, version: next, body, editedById: user.id } });
      await audit(tx, { actorId: user.id, action: "observation.update", entityType: "LeaderObservation", entityId: cur.id, metadata: { staffMemberId: t.id, version: next }, ip });
      return { version: next };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new ObservationConflictError("This observation was created by someone else. Reload and try again.");
    throw e;
  }
}

/** Revision history: Leaders in scope only (an employee sees their current observation, not its history). */
export async function listRevisions(user: AuthUser, staffMemberId: string) {
  const t = await staffTarget(staffMemberId);
  if (!t || !can(user, "observation:read", { departmentId: t.departmentId })) throw new ForbiddenError();
  const obs = await db.leaderObservation.findUnique({ where: { staffMemberId: t.id }, select: { id: true } });
  if (!obs) return [];
  return db.observationRevision.findMany({
    where: { observationId: obs.id }, orderBy: { version: "desc" },
    select: { version: true, body: true, createdAt: true, editedBy: { select: { staffMember: { select: { name: true } } } } },
  });
}

/** Leader-only audit trail for one staff member's observation (hidden from the ordinary audit log). */
export async function observationTrail(user: AuthUser, staffMemberId: string) {
  const t = await staffTarget(staffMemberId);
  if (!t || !can(user, "observation:read", { departmentId: t.departmentId })) throw new ForbiddenError();
  return db.auditEvent.findMany({
    where: { action: { startsWith: "observation." }, metadata: { path: ["staffMemberId"], equals: t.id } },
    orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, action: true, createdAt: true, metadata: true, actor: { select: { staffMember: { select: { name: true } } } } },
  });
}

/** Overview for Leaders: who has an observation and when it last changed — never the text. */
export async function listObservationOverview(user: AuthUser, f: { q?: string; page: number }) {
  const scope = scopeFor(user, "observation:read");
  if (scope !== "ALL" && scope.length === 0) throw new ForbiddenError();
  const where = {
    ...(scope === "ALL" ? {} : { departmentId: { in: scope } }),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" as const } }, { staffId: { contains: f.q, mode: "insensitive" as const } }] } : {}),
  };
  const [total, rows] = await db.$transaction([
    db.staffMember.count({ where }),
    db.staffMember.findMany({
      where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (f.page - 1) * OBSERVATION_PAGE_SIZE, take: OBSERVATION_PAGE_SIZE,
      select: {
        id: true, staffId: true, name: true, designation: { select: { name: true } }, department: { select: { name: true } },
        observation: { select: { version: true, updatedAt: true } }, // metadata only — body is not selected
      },
    }),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / OBSERVATION_PAGE_SIZE)) };
}

/* ───────── Observation migration (Leader-only, separately authorised) ─────────
 * A Leader with `observation:import` uploads a dedicated workbook (Staff ID + Observation text). The upload itself
 * is the explicit authorisation (leaderAuthorisedById). Rows are staged privately, then committed by the SAME Leader.
 * Existing observations are never overwritten; every row is re-checked against the Leader's write scope.
 */
export interface ObservationImportRow { rowNumber: number; staffId: string; body: string }

const importIssue = (batchId: string, rowNumber: number | null, code: string, message: string) =>
  ({ batchId, rowNumber, column: null, code, severity: "ERROR" as const, message });

export async function stageObservationImport(
  user: AuthUser, input: { fileAssetId: string; originalName: string; rows: ObservationImportRow[]; ip: string | null },
): Promise<{ id: string; staged: number; rejected: number }> {
  if (!can(user, "observation:import")) throw new ForbiddenError();

  const staff = await db.staffMember.findMany({ select: { id: true, staffId: true, departmentId: true, observation: { select: { id: true } } }, take: 100_000 });
  const byKey = new Map(staff.map((s) => [s.staffId.toLowerCase(), s]));

  const good: Array<{ rowNumber: number; staffIdKey: string; body: string }> = [];
  const problems: Array<{ rowNumber: number; code: string; message: string }> = [];
  const seen = new Set<string>();
  for (const r of input.rows) {
    const key = r.staffId.trim().toLowerCase();
    const t = byKey.get(key);
    const body = bodySchema.safeParse(r.body);
    if (!key || !t || !canWriteObservation(user, { staffMemberId: t.id, departmentId: t.departmentId })) {
      problems.push({ rowNumber: r.rowNumber, code: "NOT_PERMITTED", message: "Staff ID not found, outside your scope, or your own record." });
    } else if (!body.success) problems.push({ rowNumber: r.rowNumber, code: "INVALID_TEXT", message: "Observation text is empty or longer than 10,000 characters." });
    else if (seen.has(key)) problems.push({ rowNumber: r.rowNumber, code: "DUPLICATE_IN_FILE", message: "Staff ID appears earlier in the file." });
    else if (t.observation) problems.push({ rowNumber: r.rowNumber, code: "ALREADY_EXISTS", message: "An observation already exists. Existing observations are never overwritten." });
    else { seen.add(key); good.push({ rowNumber: r.rowNumber, staffIdKey: key, body: body.data }); }
  }

  return db.$transaction(async (tx) => {
    const b = await tx.importBatch.create({
      data: {
        fileAssetId: input.fileAssetId, originalName: input.originalName, status: "VALIDATED", includesObservations: true,
        leaderAuthorisedById: user.id, createdById: user.id, totalRows: input.rows.length,
      },
      select: { id: true },
    });
    for (let i = 0; i < good.length; i += 200) await tx.importObservationRow.createMany({ data: good.slice(i, i + 200).map((g) => ({ ...g, batchId: b.id })) });
    if (problems.length) await tx.importRowIssue.createMany({ data: problems.map((p) => importIssue(b.id, p.rowNumber, p.code, p.message)) });
    await audit(tx, { actorId: user.id, action: "import.observation.stage", entityType: "ImportBatch", entityId: b.id, metadata: { rows: input.rows.length, staged: good.length }, ip: input.ip });
    return { id: b.id, staged: good.length, rejected: problems.length };
  }, { timeout: 120_000 });
}

export async function getObservationImport(user: AuthUser, batchId: string) {
  if (!can(user, "observation:import")) throw new ForbiddenError();
  const b = await db.importBatch.findFirst({
    where: { id: batchId, includesObservations: true, leaderAuthorisedById: user.id },
    select: { id: true, originalName: true, status: true, totalRows: true, committedRows: true, createdAt: true, fileAssetId: true },
  });
  if (!b) return null;
  const [staged, issues] = await Promise.all([
    db.importObservationRow.count({ where: { batchId } }),
    db.importRowIssue.findMany({ where: { batchId }, orderBy: { rowNumber: "asc" }, take: 200, select: { rowNumber: true, code: true, message: true } }),
  ]);
  return { ...b, staged, issues };
}

export async function listObservationImports(user: AuthUser) {
  if (!can(user, "observation:import")) throw new ForbiddenError();
  return db.importBatch.findMany({
    where: { includesObservations: true, leaderAuthorisedById: user.id }, orderBy: { createdAt: "desc" }, take: 20,
    select: { id: true, originalName: true, status: true, totalRows: true, committedRows: true, createdAt: true },
  });
}

export async function commitObservationImport(user: AuthUser, batchId: string, ip: string | null): Promise<{ committed: number; skipped: number; fileAssetId: string }> {
  if (!can(user, "observation:import")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const claim = await tx.importBatch.updateMany({
      where: { id: batchId, includesObservations: true, status: "VALIDATED", leaderAuthorisedById: user.id }, data: { status: "COMMITTED" },
    });
    if (claim.count === 0) throw new ObservationConflictError("This import is not ready to commit.");
    const batch = await tx.importBatch.findUniqueOrThrow({ where: { id: batchId }, select: { fileAssetId: true } });

    const rows = await tx.importObservationRow.findMany({ where: { batchId, committed: false }, orderBy: { rowNumber: "asc" }, select: { rowNumber: true, staffIdKey: true, body: true } });
    const staff = await tx.staffMember.findMany({ select: { id: true, staffId: true, departmentId: true, observation: { select: { id: true } } } });
    const byKey = new Map(staff.map((s) => [s.staffId.toLowerCase(), s]));

    let committed = 0, skipped = 0;
    for (const r of rows) {
      const t = byKey.get(r.staffIdKey);
      if (!t || t.observation || !canWriteObservation(user, { staffMemberId: t.id, departmentId: t.departmentId })) {
        skipped++;
        await tx.importRowIssue.create({ data: importIssue(batchId, r.rowNumber, "SKIPPED_AT_COMMIT", "Row no longer eligible (changed since staging).") });
        continue;
      }
      const o = await tx.leaderObservation.create({ data: { staffMemberId: t.id, body: r.body, version: 1, createdById: user.id, updatedById: user.id }, select: { id: true } });
      await tx.observationRevision.create({ data: { observationId: o.id, version: 1, body: r.body, editedById: user.id } });
      await audit(tx, { actorId: user.id, action: "observation.import", entityType: "LeaderObservation", entityId: o.id, metadata: { staffMemberId: t.id, version: 1, batchId }, ip });
      committed++;
    }
    await tx.importObservationRow.deleteMany({ where: { batchId } }); // staged text is removed once migrated
    await tx.importBatch.update({ where: { id: batchId }, data: { committedRows: committed } });
    await audit(tx, { actorId: user.id, action: "import.observation.commit", entityType: "ImportBatch", entityId: batchId, metadata: { committed, skipped }, ip });
    return { committed, skipped, fileAssetId: batch.fileAssetId };
  }, { isolationLevel: "Serializable", timeout: 180_000 });
}

export async function cancelObservationImport(user: AuthUser, batchId: string, ip: string | null): Promise<string | null> {
  if (!can(user, "observation:import")) throw new ForbiddenError();
  const b = await db.importBatch.findFirst({ where: { id: batchId, includesObservations: true, leaderAuthorisedById: user.id }, select: { status: true, fileAssetId: true } });
  if (!b || b.status === "COMMITTED") throw new ObservationConflictError("This import cannot be cancelled.");
  await db.$transaction(async (tx) => {
    await tx.importObservationRow.deleteMany({ where: { batchId } });
    await tx.importBatch.update({ where: { id: batchId }, data: { status: "CANCELLED" } });
    await audit(tx, { actorId: user.id, action: "import.observation.cancel", entityType: "ImportBatch", entityId: batchId, ip });
  });
  return b.fileAssetId;
}
