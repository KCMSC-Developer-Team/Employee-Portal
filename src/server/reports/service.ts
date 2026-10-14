import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { EMPLOYMENT_STATUS_LABEL, fmtDate } from "@/lib/labels";
import { ForbiddenError, can, scopeFor, type AuthUser } from "@/server/authz/policy";
import { csvCell } from "@/server/import/normalize";
import type { StaffFilters } from "@/server/staff/queries";

const MAX_ROWS = 10_000;

/**
 * Staff roster CSV. Fixed, non-sensitive column set: NO NID/passport, date of birth, addresses, photo or Observation.
 * Honors the caller's staff:read scope; the export itself is audited (counts only).
 */
export async function staffRosterCsv(user: AuthUser, f: Omit<StaffFilters, "page">, ip: string | null): Promise<string> {
  if (!can(user, "report:read")) throw new ForbiddenError();
  const scope = scopeFor(user, "staff:read");
  if (scope !== "ALL" && scope.length === 0) throw new ForbiddenError();

  const and: Prisma.StaffMemberWhereInput[] = [];
  if (scope !== "ALL") and.push({ departmentId: { in: scope } });
  if (f.departmentId) and.push({ departmentId: f.departmentId });
  if (f.status) and.push({ employmentStatus: f.status });
  if (f.designationId) and.push({ designationId: f.designationId });
  if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.q) and.push({ OR: [{ name: { contains: f.q, mode: "insensitive" } }, { staffId: { contains: f.q, mode: "insensitive" } }] });

  const rows = await db.staffMember.findMany({
    where: { AND: and }, orderBy: [{ name: "asc" }, { id: "asc" }], take: MAX_ROWS,
    select: {
      staffId: true, name: true, employmentStatus: true, joiningDate: true, subject: true, mobile: true, email: true,
      designation: { select: { name: true } }, department: { select: { name: true } }, category: { select: { name: true } },
    },
  });
  await audit(db, { actorId: user.id, action: "report.export", entityType: "StaffRoster", metadata: { rows: rows.length }, ip });

  const head = ["Staff ID", "Name", "Designation", "Department", "Joined as", "Status", "Joining date", "Subject", "Mobile", "Email"];
  const body = rows.map((r) => [
    r.staffId, r.name, r.designation?.name, r.department?.name, r.category?.name,
    EMPLOYMENT_STATUS_LABEL[r.employmentStatus], fmtDate(r.joiningDate) === "—" ? "" : fmtDate(r.joiningDate), r.subject, r.mobile, r.email,
  ].map(csvCell).join(","));
  return "﻿" + [head.join(","), ...body].join("\r\n") + "\r\n";
}
