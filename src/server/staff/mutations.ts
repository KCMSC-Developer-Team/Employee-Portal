import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { EDUCATION_LEVELS } from "@/lib/labels";
import { EXP_SLOTS, hasRowContent, type StaffCreateInput, type StaffUpdateInput } from "@/lib/validation/staff";
import { assertCan, type AuthUser } from "@/server/authz/policy";
import { provisionAccount } from "@/server/auth/credentials";

export class ConflictError extends Error {}
export class NotFoundError extends Error {}

const toDate = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function scalarData(i: StaffUpdateInput) {
  return {
    name: i.name,
    designationId: i.designationId,
    categoryId: i.categoryId,
    departmentId: i.departmentId,
    joiningDate: toDate(i.joiningDate),
    dateOfBirth: toDate(i.dateOfBirth),
    subject: i.subject,
    additionalQualifications: i.additionalQualifications,
    mobile: i.mobile,
    email: i.email,
    maritalStatus: i.maritalStatus,
    bloodGroup: i.bloodGroup,
    homeDistrict: i.homeDistrict,
    nidOrPassport: i.nidOrPassport,
    presentAddress: i.presentAddress,
    permanentAddress: i.permanentAddress,
  };
}

function educationRows(i: StaffUpdateInput) {
  return EDUCATION_LEVELS.map((level, idx) => {
    const r = i.education[level];
    return { level, title: level === "OTHER" ? r.title : null, institution: r.institution, boardOrUniversity: r.boardOrUniversity,
      subject: r.subject, passingYear: r.passingYear, result: r.result, sortOrder: idx };
  });
}

const rowHasData = (r: { institution: string | null; boardOrUniversity: string | null; subject: string | null; passingYear: number | null; result: string | null; title: string | null }) =>
  hasRowContent({ a: r.institution, b: r.boardOrUniversity, c: r.subject, d: r.passingYear, e: r.result, f: r.title });

export async function createStaff(
  actor: AuthUser,
  input: StaffCreateInput,
  opts: { createAccount: boolean; ip: string | null },
): Promise<{ id: string; temporaryPassword?: string }> {
  assertCan(actor, "staff:create", { departmentId: input.departmentId });
  if (opts.createAccount) assertCan(actor, "account:manage");

  return db.$transaction(async (tx) => {
    const staff = await tx.staffMember.create({
      data: {
        staffId: input.staffId,
        ...scalarData(input),
        education: { create: educationRows(input).filter(rowHasData) },
        experience: {
          create: EXP_SLOTS.flatMap((s) => {
            const r = input.experience[s];
            return hasRowContent(r) ? [{ slot: Number(s), organization: r.organization, designation: r.designation, startDate: toDate(r.startDate), endDate: toDate(r.endDate) }] : [];
          }),
        },
      },
      select: { id: true },
    });
    let temporaryPassword: string | undefined;
    if (opts.createAccount) {
      const acct = await provisionAccount(tx, staff.id);
      temporaryPassword = acct.temporaryPassword;
      await audit(tx, { actorId: actor.id, action: "account.create", entityType: "UserAccount", entityId: acct.userId, ip: opts.ip });
    }
    await audit(tx, { actorId: actor.id, action: "staff.create", entityType: "StaffMember", entityId: staff.id, ip: opts.ip });
    return { id: staff.id, temporaryPassword };
  });
}

/**
 * Admin edit of the official record. Optimistic concurrency: fails with ConflictError if `version` moved.
 * Audit lists changed field NAMES only, never values.
 */
export async function updateStaff(
  actor: AuthUser,
  id: string,
  input: StaffUpdateInput,
  expectedVersion: number,
  ip: string | null,
): Promise<void> {
  const existing = await db.staffMember.findUnique({
    where: { id },
    select: {
      departmentId: true, name: true, designationId: true, categoryId: true, joiningDate: true, dateOfBirth: true, subject: true,
      additionalQualifications: true, mobile: true, email: true, maritalStatus: true, bloodGroup: true, homeDistrict: true,
      nidOrPassport: true, presentAddress: true, permanentAddress: true,
      education: { select: { id: true, level: true, institution: true, boardOrUniversity: true, subject: true, passingYear: true, result: true, title: true } },
      experience: { select: { id: true, slot: true, organization: true, designation: true, startDate: true, endDate: true } },
    },
  });
  if (!existing) throw new NotFoundError();
  assertCan(actor, "staff:update", { departmentId: existing.departmentId });
  if (input.departmentId !== existing.departmentId) assertCan(actor, "staff:update", { departmentId: input.departmentId });

  const next = scalarData(input);
  const changed: string[] = [];
  for (const [k, v] of Object.entries(next)) {
    const old = (existing as Record<string, unknown>)[k];
    const a = old instanceof Date ? ymd(old) : old;
    const b = v instanceof Date ? ymd(v) : v;
    if (a !== b) changed.push(k);
  }

  await db.$transaction(async (tx) => {
    const res = await tx.staffMember.updateMany({
      where: { id, version: expectedVersion },
      data: { ...next, version: { increment: 1 } },
    });
    if (res.count === 0) throw new ConflictError("This record was changed by someone else. Reload and try again.");

    for (const row of educationRows(input)) {
      const cur = existing.education.find((e) => e.level === row.level);
      const has = rowHasData(row);
      const data = { institution: row.institution, boardOrUniversity: row.boardOrUniversity, subject: row.subject,
        passingYear: row.passingYear, result: row.result, title: row.title, sortOrder: row.sortOrder };
      if (has && cur) {
        const same = (["institution", "boardOrUniversity", "subject", "passingYear", "result", "title"] as const).every((f) => cur[f] === row[f]);
        if (!same) { await tx.educationRecord.update({ where: { id: cur.id }, data }); changed.push(`education:${row.level}`); }
      } else if (has) {
        await tx.educationRecord.create({ data: { staffMemberId: id, level: row.level, ...data } });
        changed.push(`education:${row.level}`);
      } else if (cur) {
        await tx.educationRecord.delete({ where: { id: cur.id } });
        changed.push(`education:${row.level}`);
      }
    }

    for (const s of EXP_SLOTS) {
      const r = input.experience[s];
      const cur = existing.experience.find((e) => e.slot === Number(s));
      const has = hasRowContent(r);
      const data = { organization: r.organization, designation: r.designation, startDate: toDate(r.startDate), endDate: toDate(r.endDate) };
      if (has && cur) {
        const same = cur.organization === r.organization && cur.designation === r.designation &&
          ymd(cur.startDate) === r.startDate && ymd(cur.endDate) === r.endDate;
        if (!same) { await tx.experienceRecord.update({ where: { id: cur.id }, data }); changed.push(`experience:${s}`); }
      } else if (has) {
        await tx.experienceRecord.create({ data: { staffMemberId: id, slot: Number(s), ...data } });
        changed.push(`experience:${s}`);
      } else if (cur) {
        await tx.experienceRecord.delete({ where: { id: cur.id } });
        changed.push(`experience:${s}`);
      }
    }

    await audit(tx, {
      actorId: actor.id, action: "staff.update", entityType: "StaffMember", entityId: id,
      metadata: { changedFields: changed.join(",") || "none", fromVersion: expectedVersion }, ip,
    });
  });
}

