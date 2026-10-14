/**
 * RELEASE-BLOCKING (database-backed). Drives the REAL service layer against a real PostgreSQL database
 * (with prisma/sql/db_guards.sql applied) and proves:
 *  - ordinary admins cannot read, add or edit Observation, directly or via any general API;
 *  - employees cannot read anyone else's Observation, nor edit their own;
 *  - Leaders work only inside their scope, never on themselves;
 *  - confidential text never appears in staff/audit/search results or audit rows;
 *  - nothing is deletable; privilege escalation paths are closed.
 *
 * Requires TEST_DATABASE_URL pointing at a DEDICATED database whose name contains "test".
 * This suite is never skipped: a missing database fails the run.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { seedRbac } from "@/server/rbac/seed";
import { loadAuthUser } from "@/server/authz/load-user";
import { ForbiddenError, type AuthUser } from "@/server/authz/policy";
import {
  ObservationConflictError, listObservationOverview, listRevisions, readObservation, readOwnObservation, saveObservation,
} from "@/server/observation/service";
import { getStaffProfileForAdmin, listStaff, parseFilters } from "@/server/staff/queries";
import { listAudit, recordHistory } from "@/server/audit/queries";
import { grantRole, revokeRole } from "@/server/roles/service";
import { resetCredential, setAccountStatus } from "@/server/auth/credentials";

const RUN = Math.random().toString(36).slice(2, 8);
const SECRET = `SECRET-OBS-TEXT-${RUN}`;

interface Person { staffId: string; userId: string; user: AuthUser }
let d1: string, d2: string;
let leader: Person, deptLeader: Person, hrAdmin: Person, manager: Person, empA: Person, empB: Person;

async function person(label: string, roles: Array<{ key: string; departmentId?: string }> = [], departmentId?: string): Promise<Person> {
  const staff = await db.staffMember.create({ data: { staffId: `T${RUN}-${label}`, name: `Test ${label} ${RUN}`, departmentId: departmentId ?? null } });
  const acct = await db.userAccount.create({
    data: { staffMemberId: staff.id, passwordHash: "x", accountStatus: "ACTIVE", mustChangePassword: false },
  });
  for (const r of roles) {
    const role = await db.role.findUniqueOrThrow({ where: { key: r.key } });
    await db.userRole.create({ data: { userId: acct.id, roleId: role.id, departmentId: r.departmentId ?? null, grantedById: acct.id } });
  }
  const user = await loadAuthUser(acct.id, "test-session");
  if (!user) throw new Error("fixture user failed to load");
  return { staffId: staff.id, userId: acct.id, user };
}
const reload = async (p: Person) => (await loadAuthUser(p.userId, "test-session"))!;

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required: security tests are release-blocking and must not be skipped.");
  if (!/test/i.test(new URL(url).pathname)) throw new Error("TEST_DATABASE_URL must point at a dedicated database whose name contains 'test'.");

  await seedRbac(db);
  d1 = (await db.department.create({ data: { name: `D1-${RUN}` } })).id;
  d2 = (await db.department.create({ data: { name: `D2-${RUN}` } })).id;

  leader = await person("leader", [{ key: "LEADER" }]);
  hrAdmin = await person("hr", [{ key: "HR_ADMIN" }]);
  manager = await person("manager", [{ key: "ADMIN_MANAGER" }]);
  empA = await person("empA", [], d1);
  empB = await person("empB", [], d2);
  deptLeader = await person("deptleader", [{ key: "LEADER", departmentId: d1 }], d1);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("Observation: who can read", () => {
  it("a Leader can create an observation", async () => {
    await expect(saveObservation(leader.user, empA.staffId, SECRET, 0, null)).resolves.toEqual({ version: 1 });
  });

  it("the employee concerned can read their own observation", async () => {
    const r = await readOwnObservation(empA.user);
    expect(r.allowed && r.observation?.body).toBe(SECRET);
  });

  it("an employee with no observation sees none (and learns nothing else)", async () => {
    const r = await readOwnObservation(empB.user);
    expect(r.allowed && r.observation).toBeNull();
  });

  it("employees cannot read anyone else's observation", async () => {
    expect(await readObservation(empB.user, empA.staffId)).toEqual({ allowed: false });
  });

  it("ordinary administrators cannot read it, even with every ordinary permission", async () => {
    expect(await readObservation(hrAdmin.user, empA.staffId)).toEqual({ allowed: false });
    expect(await readObservation(manager.user, empA.staffId)).toEqual({ allowed: false });
  });

  it("a department Leader can read inside their department only", async () => {
    const inScope = await readObservation(deptLeader.user, empA.staffId);
    expect(inScope.allowed && inScope.observation?.body).toBe(SECRET);
    expect(await readObservation(deptLeader.user, empB.staffId)).toEqual({ allowed: false });
  });

  it("the overview and revision history are Leader-only", async () => {
    await expect(listObservationOverview(hrAdmin.user, { page: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listObservationOverview(empA.user, { page: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listRevisions(hrAdmin.user, empA.staffId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listRevisions(empA.user, empA.staffId)).rejects.toBeInstanceOf(ForbiddenError); // employee: current text only
    const overview = await listObservationOverview(leader.user, { q: RUN, page: 1 });
    expect(JSON.stringify(overview)).not.toContain(SECRET); // metadata only, never the text
  });
});

describe("Observation: who can write", () => {
  it("employees cannot write — not their own, not others'", async () => {
    await expect(saveObservation(empA.user, empA.staffId, "self-edit", 1, null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveObservation(empB.user, empA.staffId, "edit", 1, null)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ordinary administrators cannot add or edit", async () => {
    await expect(saveObservation(hrAdmin.user, empA.staffId, "admin-edit", 1, null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveObservation(manager.user, empB.staffId, "admin-add", 0, null)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a Leader cannot write their own observation", async () => {
    await expect(saveObservation(leader.user, leader.staffId, "self", 0, null)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a department Leader cannot write outside their department", async () => {
    await expect(saveObservation(deptLeader.user, empB.staffId, "x", 0, null)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an in-scope Leader can edit; versions and revisions advance; stale edits are rejected", async () => {
    await expect(saveObservation(deptLeader.user, empA.staffId, `${SECRET}-v2`, 1, null)).resolves.toEqual({ version: 2 });
    await expect(saveObservation(leader.user, empA.staffId, "stale", 1, null)).rejects.toBeInstanceOf(ObservationConflictError);
    const revs = await listRevisions(leader.user, empA.staffId);
    expect(revs.map((r) => r.version)).toEqual([2, 1]);
  });

  it("denied writes left nothing behind", async () => {
    expect(await db.leaderObservation.count({ where: { staffMemberId: { in: [empB.staffId, leader.staffId] } } })).toBe(0);
  });
});

describe("Observation never leaks through general APIs", () => {
  it("staff profile (admin view) contains no observation data", async () => {
    const p = await getStaffProfileForAdmin(hrAdmin.user, empA.staffId);
    expect(p).not.toBeNull();
    const json = JSON.stringify(p);
    expect(json).not.toContain(SECRET);
    expect(json).not.toMatch(/observation/i);
  });

  it("staff list/search results contain no observation data", async () => {
    const list = await listStaff(hrAdmin.user, parseFilters({ q: RUN }));
    expect(list.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toMatch(/observation|SECRET-OBS/i);
  });

  it("the ordinary audit log hides observation events and never contains the text", async () => {
    const all = await listAudit(hrAdmin.user, { page: 1 });
    const json = JSON.stringify(all);
    expect(json).not.toContain(SECRET);
    expect(all.rows.some((r) => r.action.startsWith("observation."))).toBe(false);
    expect((await listAudit(hrAdmin.user, { page: 1, action: "observation." })).rows).toHaveLength(0);
    expect((await listAudit(hrAdmin.user, { page: 1, entityType: "LeaderObservation" })).rows).toHaveLength(0);
  });

  it("per-record history for a staff member hides observation events", async () => {
    const h = await recordHistory(hrAdmin.user, empA.staffId, d1);
    expect(h.some((r) => r.action.startsWith("observation."))).toBe(false);
  });

  it("observation audit rows exist but hold no text", async () => {
    const rows = await db.auditEvent.findMany({ where: { action: { startsWith: "observation." }, metadata: { path: ["staffMemberId"], equals: empA.staffId } } });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(rows)).not.toContain(SECRET);
  });
});

describe("Nothing confidential or historical can be deleted", () => {
  it("database triggers block deletes and rewrites", async () => {
    await expect(db.leaderObservation.delete({ where: { staffMemberId: empA.staffId } })).rejects.toThrow();
    const rev = await db.observationRevision.findFirstOrThrow({ where: { observation: { staffMemberId: empA.staffId } } });
    await expect(db.observationRevision.update({ where: { id: rev.id }, data: { body: "tampered" } })).rejects.toThrow();
    await expect(db.observationRevision.delete({ where: { id: rev.id } })).rejects.toThrow();
    const ev = await db.auditEvent.findFirstOrThrow({ where: { action: { startsWith: "observation." } } });
    await expect(db.auditEvent.delete({ where: { id: ev.id } })).rejects.toThrow();
    await expect(db.staffMember.delete({ where: { id: empA.staffId } })).rejects.toThrow();
  });
});

describe("Privilege escalation is closed", () => {
  it("nobody can grant themselves roles", async () => {
    const mgrRole = await db.role.findUniqueOrThrow({ where: { key: "ADMIN_MANAGER" } });
    const leaderRole = await db.role.findUniqueOrThrow({ where: { key: "LEADER" } });
    expect((await grantRole(manager.user, manager.userId, mgrRole.id, null, null)).ok).toBe(false);
    expect((await grantRole(leader.user, leader.userId, leaderRole.id, null, null)).ok).toBe(false);
  });

  it("an ordinary admin (even a role manager) cannot grant a Leader role", async () => {
    const leaderRole = await db.role.findUniqueOrThrow({ where: { key: "LEADER" } });
    expect((await grantRole(manager.user, empB.userId, leaderRole.id, null, null)).ok).toBe(false);
    expect((await grantRole(hrAdmin.user, empB.userId, leaderRole.id, null, null)).ok).toBe(false);
    expect(await db.userRole.count({ where: { userId: empB.userId } })).toBe(0);
  });

  it("a Leader cannot hand out ordinary admin roles, and plain admins cannot grant anything", async () => {
    const hrRole = await db.role.findUniqueOrThrow({ where: { key: "HR_ADMIN" } });
    expect((await grantRole(leader.user, empB.userId, hrRole.id, null, null)).ok).toBe(false);
    expect((await grantRole(hrAdmin.user, empB.userId, hrRole.id, null, null)).ok).toBe(false);
  });

  it("an ordinary admin cannot take over or disable a Leader account", async () => {
    expect(await resetCredential(hrAdmin.user, leader.userId, null)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await resetCredential(manager.user, leader.userId, null)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await setAccountStatus(hrAdmin.user, leader.userId, "DISABLED", null)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect((await db.userAccount.findUniqueOrThrow({ where: { id: leader.userId } })).accountStatus).toBe("ACTIVE");
  });

  it("granting an ordinary admin role to an employee never gives them Observation access", async () => {
    const hrRole = await db.role.findUniqueOrThrow({ where: { key: "HR_ADMIN" } });
    expect((await grantRole(manager.user, empB.userId, hrRole.id, null, null)).ok).toBe(true);
    const nowAdmin = await reload(empB);
    expect(nowAdmin.roleKeys).toContain("HR_ADMIN");
    expect(await readObservation(nowAdmin, empA.staffId)).toEqual({ allowed: false });
    await expect(saveObservation(nowAdmin, empA.staffId, "x", 2, null)).rejects.toBeInstanceOf(ForbiddenError);

    const ur = await db.userRole.findFirstOrThrow({ where: { userId: empB.userId } });
    expect((await revokeRole(manager.user, ur.id, null)).ok).toBe(true);
  });

  it("only a Leader with grant rights can grant a Leader role to someone else", async () => {
    const leaderRole = await db.role.findUniqueOrThrow({ where: { key: "LEADER" } });
    expect((await grantRole(leader.user, empB.userId, leaderRole.id, d2, null)).ok).toBe(true);
    const nowLeader = await reload(empB);
    const r = await readObservation(nowLeader, empA.staffId); // empA is in d1; empB's Leader scope is d2
    expect(r).toEqual({ allowed: false });
    const ur = await db.userRole.findFirstOrThrow({ where: { userId: empB.userId } });
    expect((await revokeRole(hrAdmin.user, ur.id, null)).ok).toBe(false); // ordinary admin cannot revoke it either
    expect((await revokeRole(leader.user, ur.id, null)).ok).toBe(true);
  });
});
