import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { EMPLOYMENT_STATUSES } from "@/lib/labels";
import { can, scopeFor, type AuthUser } from "@/server/authz/policy";

/**
 * Every staff query uses an EXPLICIT select. The LeaderObservation relation is never selected here,
 * so observation text cannot leak through staff lists, search, profile pages or (later) charts/exports.
 */
export const PAGE_SIZE = 25;

const LIST_SELECT = {
  id: true,
  staffId: true,
  name: true,
  employmentStatus: true,
  designation: { select: { name: true } },
  department: { select: { name: true } },
  category: { select: { name: true } },
  account: { select: { accountStatus: true } },
} satisfies Prisma.StaffMemberSelect;

const PROFILE_SELECT = {
  id: true,
  staffId: true,
  name: true,
  designationId: true,
  categoryId: true,
  departmentId: true,
  designation: { select: { name: true } },
  category: { select: { name: true } },
  department: { select: { name: true } },
  joiningDate: true,
  dateOfBirth: true,
  subject: true,
  additionalQualifications: true,
  mobile: true,
  email: true,
  maritalStatus: true,
  bloodGroup: true,
  homeDistrict: true,
  nidOrPassport: true,
  presentAddress: true,
  permanentAddress: true,
  photoFileId: true,
  employmentStatus: true,
  version: true,
  education: {
    select: { id: true, level: true, title: true, institution: true, boardOrUniversity: true, subject: true, passingYear: true, result: true },
    orderBy: { sortOrder: "asc" },
  },
  experience: {
    select: { id: true, slot: true, organization: true, designation: true, startDate: true, endDate: true },
    orderBy: { slot: "asc" },
  },
  account: { select: { id: true, accountStatus: true } },
} satisfies Prisma.StaffMemberSelect;

export type StaffProfile = Prisma.StaffMemberGetPayload<{ select: typeof PROFILE_SELECT }>;

const filterSchema = z.object({
  q: z.string().trim().max(64).optional().catch(undefined),
  status: z.enum(EMPLOYMENT_STATUSES).optional().catch(undefined),
  departmentId: z.string().max(40).optional().catch(undefined),
  designationId: z.string().max(40).optional().catch(undefined),
  categoryId: z.string().max(40).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type StaffFilters = z.infer<typeof filterSchema>;

export function parseFilters(sp: Record<string, string | string[] | undefined>): StaffFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) || undefined;
  return filterSchema.parse({
    q: one("q"), status: one("status"), departmentId: one("departmentId"),
    designationId: one("designationId"), categoryId: one("categoryId"), page: one("page") ?? 1,
  });
}

/** Search/filter/paginate. Honors department-scoped `staff:read` grants. Searches name and staff ID only. */
export async function listStaff(user: AuthUser, f: StaffFilters) {
  const scope = scopeFor(user, "staff:read");
  if (scope !== "ALL" && scope.length === 0) return { rows: [], total: 0, page: 1, pageCount: 1 };

  const where: Prisma.StaffMemberWhereInput = {
    ...(scope === "ALL" ? {} : { departmentId: { in: scope } }),
    ...(f.status ? { employmentStatus: f.status } : {}),
    ...(f.departmentId ? { departmentId: f.departmentId } : {}),
    ...(f.designationId ? { designationId: f.designationId } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { staffId: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  // A department filter chosen by the user must not widen a scoped grant: AND both conditions.
  if (scope !== "ALL" && f.departmentId) where.AND = [{ departmentId: { in: scope } }, { departmentId: f.departmentId }];

  const [total, rows] = await db.$transaction([
    db.staffMember.count({ where }),
    db.staffMember.findMany({
      where, select: LIST_SELECT, orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (f.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    }),
  ]);
  return { rows, total, page: f.page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Admin view of a staff profile. Returns null (→ 404) if missing or outside the user's scope. */
export async function getStaffProfileForAdmin(user: AuthUser, id: string): Promise<StaffProfile | null> {
  const p = await db.staffMember.findUnique({ where: { id }, select: PROFILE_SELECT });
  if (!p || !can(user, "staff:read", { departmentId: p.departmentId })) return null;
  return p;
}

/** The employee's own record — keyed by the session's staff member, never by a client-supplied id. */
export async function getOwnProfile(user: AuthUser): Promise<StaffProfile | null> {
  if (!user.staffMemberId) return null;
  return db.staffMember.findUnique({ where: { id: user.staffMemberId }, select: PROFILE_SELECT });
}
