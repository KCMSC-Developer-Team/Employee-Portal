/**
 * RELEASE-BLOCKING (database-backed): scope isolation, change-request integrity and account controls.
 * Requires TEST_DATABASE_URL (dedicated DB whose name contains "test") with db_guards.sql applied.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { seedRbac } from "@/server/rbac/seed";
import { loadAuthUser } from "@/server/authz/load-user";
import type { AuthUser } from "@/server/authz/policy";
import { getOwnProfile, getStaffProfileForAdmin, listStaff, parseFilters } from "@/server/staff/queries";
import { RequestError, approveRequest, rejectRequest, submitChangeRequest } from "@/server/requests/service";
import { parseRequestForm } from "@/lib/validation/staff";
import { setAccountStatus } from "@/server/auth/credentials";
import { getDashboard, parseDashboardFilters } from "@/server/analytics/queries";
import { staffRosterCsv } from "@/server/reports/service";

const RUN = Math.random().toString(36).slice(2, 8);
interface P { staffId: string; userId: string; user: AuthUser }
let d1: string, d2: string, hr: P, d1Admin: P, empA: P, empB: P, leader: P, secondReviewer: P;

async function person(label: string, roles: Array<{ key: string; departmentId?: string }> = [], departmentId?: string): Promise<P> {
  const s = await db.staffMember.create({ data: { staffId: `A${RUN}-${label}`, name: `Acc ${label} ${RUN}`, departmentId: departmentId ?? null, nidOrPassport: `NID${label.toUpperCase()}${RUN}`.slice(0, 20) } });
  const a = await db.userAccount.create({ data: { staffMemberId: s.id, passwordHash: "x", accountStatus: "ACTIVE", mustChangePassword: false } });
  for (const r of roles) {
    const role = await db.role.findUniqueOrThrow({ where: { key: r.key } });
    await db.userRole.create({ data: { userId: a.id, roleId: role.id, departmentId: r.departmentId ?? null, grantedById: a.id } });
  }
  return { staffId: s.id, userId: a.id, user: (await loadAuthUser(a.id, "t"))! };
}
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const reqInput = (name: string) => { const r = parseRequestForm(form({ name })); if (!r.success) throw new Error("fixture invalid"); return r.data; };

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required: security tests must not be skipped.");
  if (!/test/i.test(new URL(url).pathname)) throw new Error("TEST_DATABASE_URL must name a dedicated test database.");
  await seedRbac(db);
  d1 = (await db.department.create({ data: { name: `AD1-${RUN}` } })).id;
  d2 = (await db.department.create({ data: { name: `AD2-${RUN}` } })).id;
  hr = await person("hr", [{ key: "HR_ADMIN" }]);
  secondReviewer = await person("hr2", [{ key: "HR_ADMIN" }]);
  d1Admin = await person("d1admin", [{ key: "HR_ADMIN", departmentId: d1 }], d1);
  leader = await person("leader", [{ key: "LEADER" }]);
  empA = await person("empA", [], d1);
  empB = await person("empB", [], d2);
});
afterAll(async () => { await db.$disconnect(); });

describe("scope isolation", () => {
  it("an employee only ever resolves their own profile", async () => {
    const p = await getOwnProfile(empA.user);
    expect(p?.staffId).toBe(`A${RUN}-empA`);
    expect(await getStaffProfileForAdmin(empA.user, empB.staffId)).toBeNull();
    expect((await listStaff(empA.user, parseFilters({}))).rows).toEqual([]);
  });
  it("a department-scoped admin cannot see or list other departments, even by forcing the filter", async () => {
    expect(await getStaffProfileForAdmin(d1Admin.user, empB.staffId)).toBeNull();
    const ids = (await listStaff(d1Admin.user, parseFilters({ departmentId: d2 }))).rows.map((r) => r.staffId);
    expect(ids).toEqual([]);
    const mine = (await listStaff(d1Admin.user, parseFilters({ q: RUN }))).rows.map((r) => r.staffId);
    expect(mine).toContain(`A${RUN}-empA`);
    expect(mine).not.toContain(`A${RUN}-empB`);
  });
  it("a Leader (not an admin) gets no staff lists, dashboard or roster export", async () => {
    expect((await listStaff(leader.user, parseFilters({}))).rows).toEqual([]);
    await expect(getDashboard(leader.user, parseDashboardFilters({}))).rejects.toThrow();
    await expect(staffRosterCsv(leader.user, {}, null)).rejects.toThrow();
  });
  it("roster export omits NID and is audited; dashboard carries no names or NIDs", async () => {
    const csv = await staffRosterCsv(hr.user, { q: RUN }, null);
    expect(csv).toContain(`A${RUN}-empA`);
    expect(csv).not.toMatch(/NID(EMPA|EMPB|HR)/);
    expect(await db.auditEvent.count({ where: { action: "report.export", actorId: hr.userId } })).toBeGreaterThan(0);
    const dash = await getDashboard(hr.user, parseDashboardFilters({}));
    expect(JSON.stringify(dash)).not.toMatch(new RegExp(`Acc .* ${RUN}|NID`));
  });
});

describe("change requests", () => {
  let requestId: string;
  it("employee submits; only one pending request at a time", async () => {
    requestId = (await submitChangeRequest(empA.user, reqInput("Renamed Person"), null, null, null)).id;
    await expect(submitChangeRequest(empA.user, reqInput("Another Name"), null, null, null)).rejects.toMatchObject({ code: "PENDING_EXISTS" });
    expect((await db.staffMember.findUniqueOrThrow({ where: { id: empA.staffId }, select: { name: true } })).name).toBe(`Acc empA ${RUN}`); // official record untouched
  });
  it("the requester cannot approve their own request (even with review rights)", async () => {
    const self = await person("selfreviewer", [{ key: "HR_ADMIN" }]);
    const rid = (await submitChangeRequest(self.user, reqInput("Self Approve"), null, null, null)).id;
    await expect(approveRequest(self.user, rid, null)).rejects.toMatchObject({ code: "SELF_REVIEW" });
  });
  it("an out-of-scope reviewer cannot act on it", async () => {
    const d2Admin = await person("d2admin", [{ key: "HR_ADMIN", departmentId: d2 }], d2);
    await expect(approveRequest(d2Admin.user, requestId, null)).rejects.toThrow();
  });
  it("a reviewer approves exactly once; the record changes atomically", async () => {
    await approveRequest(secondReviewer.user, requestId, null);
    expect((await db.staffMember.findUniqueOrThrow({ where: { id: empA.staffId }, select: { name: true } })).name).toBe("Renamed Person");
    await expect(approveRequest(hr.user, requestId, null)).rejects.toBeInstanceOf(RequestError);
  });
  it("rejection requires a reason and leaves the record unchanged", async () => {
    const rid = (await submitChangeRequest(empB.user, reqInput("Rejected Name"), null, null, null)).id;
    await expect(rejectRequest(hr.user, rid, "  ", null)).rejects.toThrow();
    await rejectRequest(hr.user, rid, "Please attach proof.", null);
    expect((await db.staffMember.findUniqueOrThrow({ where: { id: empB.staffId }, select: { name: true } })).name).toBe(`Acc empB ${RUN}`);
  });
  it("a stale request (record changed after submission) cannot be approved", async () => {
    const e = await person("stale", [], d1);
    const rid = (await submitChangeRequest(e.user, reqInput("Stale Name"), null, null, null)).id;
    await db.staffMember.update({ where: { id: e.staffId }, data: { name: "Admin Edited", version: { increment: 1 } } });
    await expect(approveRequest(hr.user, rid, null)).rejects.toMatchObject({ code: "STALE" });
  });
});

describe("account controls", () => {
  it("disabling an account ends its sessions; an admin cannot disable themselves or a stronger account", async () => {
    await db.session.create({ data: { tokenHash: `h-${RUN}`, userId: empB.userId, expiresAt: new Date(Date.now() + 3_600_000) } });
    expect(await setAccountStatus(hr.user, empB.userId, "DISABLED", null)).toEqual({ ok: true });
    expect(await db.session.count({ where: { userId: empB.userId } })).toBe(0);
    expect(await setAccountStatus(hr.user, hr.userId, "DISABLED", null)).toMatchObject({ ok: false });
    expect(await setAccountStatus(hr.user, leader.userId, "DISABLED", null)).toMatchObject({ ok: false });
  });
});
