import { describe, expect, it } from "vitest";
import { flattenErrors, parseCreateForm, parseUpdateForm } from "@/lib/validation/staff";
import { assertCan, can, scopeFor, type AuthUser } from "@/server/authz/policy";

function form(over: Record<string, string> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = { staffId: "T-001", name: "Test Teacher" };
  for (const [k, v] of Object.entries({ ...base, ...over })) fd.set(k, v);
  return fd;
}

describe("staff form validation", () => {
  it("accepts a minimal record (historical data may be missing)", () => {
    expect(parseCreateForm(form()).success).toBe(true);
  });

  it("normalises Bangladesh mobile numbers and lowercases email", () => {
    const r = parseCreateForm(form({ mobile: "+880 1712-345678", email: "A@B.COM" }));
    expect(r.success && r.data.mobile).toBe("01712345678");
    expect(r.success && r.data.email).toBe("a@b.com");
  });

  it("reports field-addressable errors", () => {
    const r = parseCreateForm(form({ mobile: "123", dateOfBirth: "2999-01-01", "education.NTRCA.result": "140" }));
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = flattenErrors(r.error);
      expect(e.mobile).toBeDefined();
      expect(e.dateOfBirth).toBeDefined();
      expect(e["education.NTRCA.result"]).toBeDefined();
    }
  });

  it("requires a title for OTHER degree/training rows with data", () => {
    const r = parseCreateForm(form({ "education.OTHER.institution": "X" }));
    expect(!r.success && flattenErrors(r.error)["education.OTHER.title"]).toBeTruthy();
  });

  it("rejects experience end before start", () => {
    const r = parseCreateForm(form({ "experience.1.startDate": "2020-01-01", "experience.1.endDate": "2019-01-01" }));
    expect(r.success).toBe(false);
  });

  it("ignores unknown form fields (no mass assignment, e.g. employmentStatus/observation)", () => {
    const r = parseUpdateForm(form({ employmentStatus: "RESIGNED", observation: "secret", version: "1" }));
    expect(r.success).toBe(true);
    expect(r.success && Object.keys(r.data)).not.toContain("observation");
    expect(r.success && Object.keys(r.data)).not.toContain("employmentStatus");
  });
});

const user = (grants: AuthUser["grants"]): AuthUser => ({
  id: "u1", sessionId: "s1", staffMemberId: "m1", staffId: "T-001", name: "A", departmentId: null,
  mustChangePassword: false, roleKeys: [], grants,
});

describe("scoped permissions", () => {
  const scoped = user([{ permission: "staff:read", departmentId: "d1" }]);
  it("scoped grant works only inside its department", () => {
    expect(can(scoped, "staff:read", { departmentId: "d1" })).toBe(true);
    expect(can(scoped, "staff:read", { departmentId: "d2" })).toBe(false);
    expect(can(scoped, "staff:read")).toBe(false);
    expect(scopeFor(scoped, "staff:read")).toEqual(["d1"]);
  });
  it("assertCan throws when denied", () => {
    expect(() => assertCan(scoped, "staff:update")).toThrow();
  });
});
