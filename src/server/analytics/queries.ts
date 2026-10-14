import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { EMPLOYMENT_STATUS_LABEL } from "@/lib/labels";
import { bucketRequests, startOfWindow, topN, type Slice } from "@/lib/analytics";
import { profileCompleteness } from "@/lib/completeness";
import { assertCan, scopeFor, type AuthUser } from "@/server/authz/policy";
import { NOT_CONFIDENTIAL } from "@/server/audit/queries";

/**
 * Dashboard analytics. Aggregates ONLY: counts of non-sensitive categories (status, designation, department,
 * request status, completeness). No names, no NID, no Observation data — the Observation tables are not
 * referenced here, and every staff read uses an explicit select.
 */
const filterSchema = z.object({
  departmentId: z.string().max(40).optional().catch(undefined),
  months: z.coerce.number().int().refine((n) => [6, 12, 24].includes(n)).catch(12),
});
export type DashboardFilters = z.infer<typeof filterSchema>;
export const parseDashboardFilters = (sp: Record<string, string | string[] | undefined>): DashboardFilters => {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) || undefined;
  return filterSchema.parse({ departmentId: one("departmentId"), months: one("months") ?? 12 });
};

export interface Dashboard {
  total: number;
  byStatus: Slice[];
  byDesignation: Slice[];
  byDepartment: Slice[];
  byCategory: Slice[];
  requestsByStatus: Slice[];
  requestTrend: ReturnType<typeof bucketRequests>;
  completeness: Slice[];
  pendingRequests: number;
  activity: Slice[] | null; // admin action counts, only for users holding audit:read
  months: number;
  departmentLabel: string;
}

export async function getDashboard(user: AuthUser, f: DashboardFilters): Promise<Dashboard> {
  assertCan(user, "dashboard:read"); // institution-wide or department-scoped; scope below
  const scope = scopeFor(user, "dashboard:read");
  const staffScope = scopeFor(user, "staff:read");

  // The dashboard may never show wider data than BOTH grants allow.
  let allowed: "ALL" | string[] = scope;
  if (scope !== "ALL" && staffScope !== "ALL") allowed = scope.filter((d) => staffScope.includes(d));
  else if (scope === "ALL") allowed = staffScope;
  if (allowed !== "ALL" && allowed.length === 0) return emptyDashboard(f);

  const deptIn: Prisma.StaffMemberWhereInput =
    allowed === "ALL" ? {} : { departmentId: { in: allowed } };
  const where: Prisma.StaffMemberWhereInput = {
    AND: [deptIn, ...(f.departmentId ? [{ departmentId: f.departmentId }] : [])],
  };

  const now = new Date();
  const since = startOfWindow(now, f.months);

  const [staff, designations, departments, categories, reqRows, pending, deptName] = await Promise.all([
    db.staffMember.findMany({
      where,
      take: 20_000,
      select: {
        employmentStatus: true, designationId: true, departmentId: true, categoryId: true,
        name: true, joiningDate: true, dateOfBirth: true, subject: true, mobile: true, email: true, maritalStatus: true,
        bloodGroup: true, homeDistrict: true, nidOrPassport: true, presentAddress: true, permanentAddress: true, photoFileId: true,
        education: { select: { level: true, institution: true, passingYear: true } },
      },
    }),
    db.designation.findMany({ select: { id: true, name: true } }),
    db.department.findMany({ select: { id: true, name: true } }),
    db.employmentCategory.findMany({ select: { id: true, name: true } }),
    db.changeRequest.findMany({
      where: { createdAt: { gte: since }, staffMember: where },
      take: 50_000, select: { createdAt: true, status: true },
    }),
    db.changeRequest.count({ where: { status: "PENDING", staffMember: where } }),
    f.departmentId ? db.department.findUnique({ where: { id: f.departmentId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  const tally = <T,>(items: T[], key: (t: T) => string): Slice[] => {
    const m = new Map<string, number>();
    for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
    return [...m].map(([name, value]) => ({ name, value }));
  };
  const nameOf = (list: Array<{ id: string; name: string }>) => {
    const m = new Map(list.map((x) => [x.id, x.name]));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown" : "Unassigned");
  };

  const dn = nameOf(designations), pn = nameOf(departments), cn = nameOf(categories);
  const complete = staff.filter((s) => profileCompleteness(s).complete).length;

  let activity: Slice[] | null = null;
  if (scopeFor(user, "audit:read") === "ALL") {
    const since30 = new Date(now.getTime() - 30 * 86_400_000);
    const rows = await db.auditEvent.groupBy({
      by: ["action"], where: { AND: [NOT_CONFIDENTIAL, { createdAt: { gte: since30 } }] }, _count: { _all: true },
    });
    activity = topN(rows.map((r) => ({ name: r.action, value: r._count._all })), 8);
  }

  return {
    total: staff.length,
    byStatus: tally(staff, (s) => EMPLOYMENT_STATUS_LABEL[s.employmentStatus] ?? s.employmentStatus),
    byDesignation: topN(tally(staff, (s) => dn(s.designationId)), 8),
    byDepartment: topN(tally(staff, (s) => pn(s.departmentId)), 10),
    byCategory: tally(staff, (s) => cn(s.categoryId)),
    requestsByStatus: tally(reqRows, (r) => r.status.charAt(0) + r.status.slice(1).toLowerCase()),
    requestTrend: bucketRequests(reqRows, now, f.months),
    completeness: [
      { name: "Complete", value: complete },
      { name: "Incomplete", value: staff.length - complete },
    ].filter((s) => s.value > 0),
    pendingRequests: pending,
    activity,
    months: f.months,
    departmentLabel: deptName?.name ?? "All departments",
  };
}

function emptyDashboard(f: DashboardFilters): Dashboard {
  return {
    total: 0, byStatus: [], byDesignation: [], byDepartment: [], byCategory: [], requestsByStatus: [],
    requestTrend: bucketRequests([], new Date(), f.months), completeness: [], pendingRequests: 0, activity: null,
    months: f.months, departmentLabel: "—",
  };
}
