/**
 * RELEASE-BLOCKING (pure policy layer, no database). Proves the authorization rules for Observation and
 * Leader roles at the lowest level. The database-backed suite re-proves them through the real services.
 */
import { describe, expect, it, vi } from "vitest";
import { LEADER_PERMISSIONS, SYSTEM_ROLES, isLeaderPermission, type PermissionKey } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import {
  can, canGrantRole, canGrantRoleFull, canManageAccount, canViewObservation, canWriteObservation, type AuthUser, type Grant,
} from "@/server/authz/policy";

function userWith(roleKeys: string[], opts: { staffMemberId?: string | null; departmentId?: string | null } = {}): AuthUser {
  const grants: Grant[] = roleKeys.flatMap((k) =>
    (SYSTEM_ROLES.find((r) => r.key === k)?.permissions ?? []).map((p) => ({ permission: p, departmentId: opts.departmentId ?? null })));
  return {
    id: `u-${roleKeys.join("-")}-${opts.staffMemberId ?? "x"}`, sessionId: "s", staffMemberId: opts.staffMemberId ?? null, staffId: null,
    name: "T", departmentId: null, mustChangePassword: false, roleKeys, grants,
  };
}
const target = (staffMemberId: string, departmentId: string | null = null) => ({ staffMemberId, departmentId });

describe("role catalogue", () => {
  it("no non-leader role carries a Leader permission; the Leader role carries only Leader permissions", () => {
    for (const r of SYSTEM_ROLES) {
      if (r.isLeader) expect(r.permissions.every((p) => isLeaderPermission(p))).toBe(true);
      else expect(r.permissions.some((p) => isLeaderPermission(p))).toBe(false);
    }
    expect(SYSTEM_ROLES.find((r) => r.key === "LEADER")?.permissions).toEqual(LEADER_PERMISSIONS);
  });
});

describe("Observation access", () => {
  const ordinaryAdmins = [userWith(["HR_ADMIN"]), userWith(["ADMIN_MANAGER"]), userWith(["HR_ADMIN", "ADMIN_MANAGER"])];

  it("ordinary administrators can never view or write anyone else's observation", () => {
    for (const a of ordinaryAdmins) {
      expect(canViewObservation(a, target("someone"))).toBe(false);
      expect(canWriteObservation(a, target("someone"))).toBe(false);
      expect(can(a, "observation:read")).toBe(false);
      expect(can(a, "observation:write")).toBe(false);
    }
  });

  it("an admin may read only their OWN observation (as an employee) and never write it", () => {
    const a = userWith(["HR_ADMIN"], { staffMemberId: "me" });
    expect(canViewObservation(a, target("me"))).toBe(true);
    expect(canWriteObservation(a, target("me"))).toBe(false);
  });

  it("employees: own read only, no writes, no access to others", () => {
    const e = userWith([], { staffMemberId: "A" });
    expect(canViewObservation(e, target("A"))).toBe(true);
    expect(canWriteObservation(e, target("A"))).toBe(false);
    expect(canViewObservation(e, target("B"))).toBe(false);
    expect(canWriteObservation(e, target("B"))).toBe(false);
  });

  it("institution-wide Leader: read/write others, never write their own", () => {
    const l = userWith(["LEADER"], { staffMemberId: "L" });
    expect(canViewObservation(l, target("B", "d1"))).toBe(true);
    expect(canWriteObservation(l, target("B", "d1"))).toBe(true);
    expect(canViewObservation(l, target("L"))).toBe(true);
    expect(canWriteObservation(l, target("L"))).toBe(false);
  });

  it("department-scoped Leader is limited to their department (and staff with no department are out of scope)", () => {
    const l = userWith(["LEADER"], { staffMemberId: "L", departmentId: "d1" });
    expect(canViewObservation(l, target("B", "d1"))).toBe(true);
    expect(canWriteObservation(l, target("B", "d1"))).toBe(true);
    expect(canViewObservation(l, target("C", "d2"))).toBe(false);
    expect(canWriteObservation(l, target("C", "d2"))).toBe(false);
    expect(canViewObservation(l, target("D", null))).toBe(false);
  });
});

describe("Role granting", () => {
  const manager = userWith(["ADMIN_MANAGER"], { staffMemberId: "m" });
  const leader = userWith(["LEADER"], { staffMemberId: "l" });
  const leaderRole = { isLeader: true, permissions: [...LEADER_PERMISSIONS] as PermissionKey[] };
  const hrRole = { isLeader: false, permissions: SYSTEM_ROLES.find((r) => r.key === "HR_ADMIN")!.permissions as PermissionKey[] };

  it("nobody can grant roles to themselves", () => {
    expect(canGrantRole(manager, manager.id, { isLeader: false })).toBe(false);
    expect(canGrantRole(leader, leader.id, { isLeader: true })).toBe(false);
  });
  it("an ordinary admin (even a role manager) can never grant a Leader role", () => {
    expect(canGrantRoleFull(manager, "other", leaderRole)).toBe(false);
    expect(canGrantRoleFull(userWith(["HR_ADMIN"]), "other", leaderRole)).toBe(false);
  });
  it("a Leader can grant Leader roles to others but cannot hand out ordinary admin roles", () => {
    expect(canGrantRoleFull(leader, "other", leaderRole)).toBe(true);
    expect(canGrantRoleFull(leader, "other", hrRole)).toBe(false);
  });
  it("a role manager can grant ordinary roles to others, but not roles stronger than their own", () => {
    expect(canGrantRoleFull(manager, "other", hrRole)).toBe(true);
    const weak = userWith([]);
    weak.grants.push({ permission: "role:assign:ordinary", departmentId: null });
    expect(canGrantRoleFull(weak, "other", hrRole)).toBe(false);
  });
  it("plain administrators cannot grant anything", () => {
    expect(canGrantRoleFull(userWith(["HR_ADMIN"]), "other", { isLeader: false, permissions: [] })).toBe(false);
  });
});

describe("Account takeover protection", () => {
  const hr = userWith(["HR_ADMIN"], { staffMemberId: "h" });
  const leaderPerms = [...LEADER_PERMISSIONS] as PermissionKey[];
  it("an ordinary admin cannot reset/disable a Leader or a stronger admin", () => {
    expect(canManageAccount(hr, "leader-user", leaderPerms)).toBe(false);
    expect(canManageAccount(hr, "mgr-user", SYSTEM_ROLES.find((r) => r.key === "ADMIN_MANAGER")!.permissions as PermissionKey[])).toBe(false);
  });
  it("an admin can manage ordinary employees, but not themselves", () => {
    expect(canManageAccount(hr, "emp-user", [])).toBe(true);
    expect(canManageAccount(hr, hr.id, [])).toBe(false);
  });
});

describe("Audit never carries confidential text", () => {
  it("rejects metadata keys that could hold observation text, passwords or tokens", async () => {
    const fake = { auditEvent: { create: vi.fn() } };
    for (const key of ["body", "observation", "observationText", "password", "token", "nidOrPassport"]) {
      await expect(audit(fake as never, { action: "x", entityType: "y", metadata: { [key]: "secret" } })).rejects.toThrow();
    }
    expect(fake.auditEvent.create).not.toHaveBeenCalled();
    await expect(audit(fake as never, { action: "observation.update", entityType: "LeaderObservation", metadata: { staffMemberId: "s", version: 2 } })).resolves.toBeUndefined();
  });
});
