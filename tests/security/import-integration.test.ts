/**
 * RELEASE-BLOCKING (database-backed): Excel import safety and Observation-migration isolation.
 * Requires TEST_DATABASE_URL (dedicated DB whose name contains "test") with db_guards.sql applied.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { seedRbac } from "@/server/rbac/seed";
import { loadAuthUser } from "@/server/authz/load-user";
import { ForbiddenError, type AuthUser } from "@/server/authz/policy";
import { commitBatch, createBatch, getBatch, reconcile, saveMapping, validateBatch } from "@/server/import/service";
import { commitObservationWorkbook, uploadObservationWorkbook } from "@/server/import/observations";
import { readObservation } from "@/server/observation/service";
import { suggestMapping } from "@/server/import/catalog";
import { listAudit } from "@/server/audit/queries";

const RUN = Math.random().toString(36).slice(2, 8);
const SECRET = `MIGRATED-SECRET-${RUN}`;
let hr: AuthUser, leader: AuthUser, existingId: string, targetId: string;

async function user(label: string, role: string): Promise<{ u: AuthUser; staffId: string }> {
  const s = await db.staffMember.create({ data: { staffId: `I${RUN}-${label}`, name: `Imp ${label}` } });
  const a = await db.userAccount.create({ data: { staffMemberId: s.id, passwordHash: "x", accountStatus: "ACTIVE", mustChangePassword: false } });
  const r = await db.role.findUniqueOrThrow({ where: { key: role } });
  await db.userRole.create({ data: { userId: a.id, roleId: r.id, grantedById: a.id } });
  return { u: (await loadAuthUser(a.id, "t"))!, staffId: s.id };
}

async function xlsx(rows: string[][]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("s");
  rows.forEach((r) => ws.addRow(r));
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new File([buf], "t.xlsx");
}

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required: security tests must not be skipped.");
  if (!/test/i.test(new URL(url).pathname)) throw new Error("TEST_DATABASE_URL must name a dedicated test database.");
  await seedRbac(db);
  hr = (await user("hr", "HR_ADMIN")).u;
  const l = await user("leader", "LEADER");
  leader = l.u;
  existingId = (await db.staffMember.create({ data: { staffId: `E${RUN}`, name: "Existing Person" } })).staffId;
  targetId = (await db.staffMember.create({ data: { staffId: `O${RUN}`, name: "Obs Target" } })).id;
});
afterAll(async () => { await db.$disconnect(); });

describe("staff import", () => {
  let batchId: string;
  it("stages, flags conflicts, never overwrites, and commits only valid rows", async () => {
    const f = await xlsx([
      ["ID No", "Name", "Password", "Mobile"],
      [`N${RUN}-1`, "New One", "hunter2", "01712345678"],
      [`N${RUN}-1`, "New One again", "", ""],
      [existingId, "Different Name", "", ""],
      [`N${RUN}-3`, "X", "", "123"],
    ]);
    batchId = (await createBatch(hr, f, null)).id;
    const b = (await getBatch(hr, batchId))!;
    await saveMapping(hr, batchId, b.mapping!.map, null);
    const r = await validateBatch(hr, batchId, null);
    expect(r).toMatchObject({ valid: 1, duplicate: 1, conflict: 1, invalid: 1 });

    const before = await db.staffMember.findUniqueOrThrow({ where: { staffId: existingId }, select: { name: true } });
    const c = await commitBatch(hr, batchId, null);
    expect(c.committed).toBe(1);
    expect((await db.staffMember.findUniqueOrThrow({ where: { staffId: existingId }, select: { name: true } })).name).toBe(before.name);
    expect(await db.userAccount.count({ where: { staffMember: { staffId: `N${RUN}-1` } } })).toBe(0); // no account / password created

    const rec = await reconcile(hr, batchId);
    expect(rec).toMatchObject({ accountedFor: true, committedMatches: true });
  });
  it("cannot be committed twice and clears staged personal data", async () => {
    await expect(commitBatch(hr, batchId, null)).rejects.toThrow();
    const left = await db.importRow.findMany({ where: { batchId }, select: { data: true } });
    expect(left.every((r) => JSON.stringify(r.data) === "{}")).toBe(true);
  });
  it("issues never contain cell values", async () => {
    const issues = await db.importRowIssue.findMany({ where: { batchId }, select: { message: true } });
    expect(JSON.stringify(issues)).not.toMatch(/hunter2|Different Name|01712345678/);
  });
  it("a Leader (not an importer) cannot use the staff import", async () => {
    await expect(createBatch(leader, await xlsx([["ID No", "Name"]]), null)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("observation migration", () => {
  it("ordinary admins cannot upload or commit an observation workbook", async () => {
    const f = await xlsx([["Staff ID", "Observation"], [`O${RUN}`, SECRET]]);
    await expect(uploadObservationWorkbook(hr, f, null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(commitObservationWorkbook(hr, "nope", null)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("a Leader migrates it; text is Leader-readable only and appears nowhere else", async () => {
    const f = await xlsx([["Staff ID", "Observation"], [`O${RUN}`, SECRET], [`O${RUN}`, "dup"], ["missing-id", "x"]]);
    const up = await uploadObservationWorkbook(leader, f, null);
    expect(up).toMatchObject({ staged: 1, rejected: 2 });
    expect(await commitObservationWorkbook(leader, up.id, null)).toEqual({ committed: 1, skipped: 0 });

    const read = await readObservation(leader, targetId);
    expect(read.allowed && read.observation?.body).toBe(SECRET);
    expect(await readObservation(hr, targetId)).toEqual({ allowed: false });

    // staging text removed; ordinary audit log and ordinary import views carry no trace
    expect(await db.importObservationRow.count({ where: { batchId: up.id } })).toBe(0);
    const audit = await listAudit(hr, { page: 1 } as never);
    expect(JSON.stringify(audit)).not.toMatch(new RegExp(SECRET));
    expect(JSON.stringify(audit)).not.toMatch(/observation\./);
    expect(await getBatch(hr, up.id)).toBeNull(); // staff import screens never show observation batches
  });
  it("never overwrites an existing observation", async () => {
    const f = await xlsx([["Staff ID", "Observation"], [`O${RUN}`, "replacement"]]);
    const up = await uploadObservationWorkbook(leader, f, null);
    expect(up.staged).toBe(0);
    const read = await readObservation(leader, targetId);
    expect(read.allowed && read.observation?.body).toBe(SECRET);
  });
});

void suggestMapping;
