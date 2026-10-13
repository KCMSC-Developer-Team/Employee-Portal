import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { EDUCATION_LEVELS } from "@/lib/labels";
import {
  REQUEST_SCALAR_FIELDS, eduRowSchemaFor, expRowSchema, requestFieldSchema, type RequestInput, type RequestScalarField,
} from "@/lib/validation/staff";
import { assertCan, scopeFor, type AuthUser } from "@/server/authz/policy";
import { NotFoundError } from "@/server/staff/mutations";
import { storeProfilePhoto } from "@/server/files/storage";
import { asFormValues, buildItems, eduRow, expRow, jsonEqual, type CurrentRecord, type JsonValue } from "./diff";

export type RequestErrorCode = "PENDING_EXISTS" | "NO_CHANGES" | "STALE" | "NOT_PENDING" | "SELF_REVIEW" | "INVALID";
export class RequestError extends Error {
  constructor(public code: RequestErrorCode, message: string) {
    super(message);
  }
}

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
export const PAGE_SIZE = 25;

const CURRENT_SELECT = {
  id: true, departmentId: true, photoFileId: true, name: true, dateOfBirth: true, subject: true, additionalQualifications: true,
  mobile: true, email: true, maritalStatus: true, bloodGroup: true, homeDistrict: true, nidOrPassport: true,
  presentAddress: true, permanentAddress: true,
  education: { select: { id: true, level: true, title: true, institution: true, boardOrUniversity: true, subject: true, passingYear: true, result: true } },
  experience: { select: { id: true, slot: true, organization: true, designation: true, startDate: true, endDate: true } },
} satisfies Prisma.StaffMemberSelect;
type CurrentRow = Prisma.StaffMemberGetPayload<{ select: typeof CURRENT_SELECT }>;

function toCurrentRecord(s: CurrentRow): CurrentRecord {
  return {
    scalars: {
      name: s.name, dateOfBirth: ymd(s.dateOfBirth), subject: s.subject, additionalQualifications: s.additionalQualifications,
      mobile: s.mobile, email: s.email, maritalStatus: s.maritalStatus, bloodGroup: s.bloodGroup, homeDistrict: s.homeDistrict,
      nidOrPassport: s.nidOrPassport, presentAddress: s.presentAddress, permanentAddress: s.permanentAddress,
    },
    education: s.education,
    experience: s.experience.map((e) => ({ ...e, startDate: ymd(e.startDate), endDate: ymd(e.endDate) })),
  };
}

/* ───────────────────────── employee: submit / cancel ───────────────────────── */

export async function submitChangeRequest(
  user: AuthUser, input: RequestInput, photo: File | null, note: string | null, ip: string | null,
): Promise<{ id: string }> {
  if (!user.staffMemberId) throw new RequestError("INVALID", "No staff profile on this account.");
  const staffId = user.staffMemberId;

  if (await db.changeRequest.findFirst({ where: { staffMemberId: staffId, status: "PENDING" }, select: { id: true } })) {
    throw new RequestError("PENDING_EXISTS", "You already have a pending request. Wait for a decision or cancel it first.");
  }
  const staff = await db.staffMember.findUniqueOrThrow({ where: { id: staffId }, select: { ...CURRENT_SELECT, version: true } });
  const items = buildItems(toCurrentRecord(staff), input);
  if (items.length === 0 && !photo) throw new RequestError("NO_CHANGES", "You haven't changed anything.");

  const photoAsset = photo && photo.size > 0 ? await storeProfilePhoto(photo, { ownerStaffId: staffId, uploadedById: user.id }) : null;
  if (!items.length && !photoAsset) throw new RequestError("NO_CHANGES", "You haven't changed anything.");

  try {
    return await db.$transaction(async (tx) => {
      const req = await tx.changeRequest.create({
        data: {
          staffMemberId: staffId, submittedById: user.id, baseVersion: staff.version, note,
          items: {
            create: [
              ...items.map((i) => ({
                target: i.target, fieldKey: i.fieldKey, recordId: i.recordId, recordKey: i.recordKey,
                oldValue: i.oldValue as Prisma.InputJsonValue ?? undefined, newValue: i.newValue as Prisma.InputJsonValue ?? undefined,
              })),
              ...(photoAsset ? [{ target: "PHOTO" as const, fieldKey: "photo", photoFileId: photoAsset.id, oldValue: { fileId: staff.photoFileId }, newValue: { fileId: photoAsset.id } }] : []),
            ],
          },
        },
        select: { id: true },
      });
      const fields = [...items.map((i) => (i.recordKey ? `${i.fieldKey}:${i.recordKey}` : i.fieldKey)), ...(photoAsset ? ["photo"] : [])];
      await audit(tx, { actorId: user.id, action: "request.submit", entityType: "ChangeRequest", entityId: req.id, metadata: { staffMemberId: staffId, fields: fields.join(",") }, ip });
      return req;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new RequestError("PENDING_EXISTS", "You already have a pending request.");
    throw e;
  }
}

export async function cancelOwnRequest(user: AuthUser, requestId: string, ip: string | null): Promise<void> {
  if (!user.staffMemberId) throw new NotFoundError();
  await db.$transaction(async (tx) => {
    const r = await tx.changeRequest.updateMany({
      where: { id: requestId, staffMemberId: user.staffMemberId!, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    if (r.count === 0) throw new RequestError("NOT_PENDING", "This request can no longer be cancelled.");
    await audit(tx, { actorId: user.id, action: "request.cancel", entityType: "ChangeRequest", entityId: requestId, ip });
  });
}

/* ───────────────────────── reads ───────────────────────── */

const ITEM_SELECT = { id: true, target: true, fieldKey: true, recordKey: true, oldValue: true, newValue: true, photoFileId: true } as const;

/** Employee: only their own requests (keyed by session, not by URL). */
export async function listOwnRequests(user: AuthUser) {
  if (!user.staffMemberId) return [];
  return db.changeRequest.findMany({
    where: { staffMemberId: user.staffMemberId },
    orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, status: true, createdAt: true, reviewedAt: true, rejectionReason: true, note: true, items: { select: ITEM_SELECT } },
  });
}

const statusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
export function parseRequestFilters(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  return {
    status: statusSchema.catch("PENDING").parse(one("status") ?? "PENDING"),
    page: z.coerce.number().int().min(1).max(10_000).catch(1).parse(one("page") ?? 1),
  };
}

export async function listRequestsForReview(user: AuthUser, f: { status: z.infer<typeof statusSchema>; page: number }) {
  const scope = scopeFor(user, "request:review");
  if (scope !== "ALL" && scope.length === 0) return { rows: [], total: 0, pageCount: 1 };
  const where: Prisma.ChangeRequestWhereInput = {
    status: f.status,
    ...(scope === "ALL" ? {} : { staffMember: { departmentId: { in: scope } } }),
  };
  const [total, rows] = await db.$transaction([
    db.changeRequest.count({ where }),
    db.changeRequest.findMany({
      where, orderBy: [{ createdAt: f.status === "PENDING" ? "asc" : "desc" }, { id: "asc" }],
      skip: (f.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, status: true, createdAt: true, staffMember: { select: { id: true, name: true, staffId: true } }, _count: { select: { items: true } } },
    }),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getRequestForReview(user: AuthUser, id: string) {
  const r = await db.changeRequest.findUnique({
    where: { id },
    select: {
      id: true, status: true, createdAt: true, reviewedAt: true, rejectionReason: true, note: true, staffMemberId: true,
      staffMember: { select: { id: true, name: true, staffId: true, departmentId: true } },
      reviewedBy: { select: { staffMember: { select: { name: true } } } },
      items: { select: ITEM_SELECT },
    },
  });
  if (!r) return null;
  try {
    assertCan(user, "request:review", { departmentId: r.staffMember.departmentId });
  } catch {
    return null; // out of scope looks exactly like "missing"
  }
  return r;
}

/* ───────────────────────── reviewer: approve / reject ───────────────────────── */

function guardReviewer(actor: AuthUser, req: { staffMemberId: string; staffMember: { departmentId: string | null } }) {
  assertCan(actor, "request:review", { departmentId: req.staffMember.departmentId });
  if (actor.staffMemberId === req.staffMemberId) throw new RequestError("SELF_REVIEW", "You cannot review your own request.");
}

/**
 * Atomic approval. The claim (PENDING → APPROVED) is a conditional UPDATE, so exactly one reviewer wins a race.
 * Every item's recorded old value is re-checked against the live record; any mismatch aborts and rolls back
 * everything (the request stays PENDING) — a reviewer must then reject or ask for resubmission.
 * All new values are re-validated server-side; nothing stored in an item is trusted.
 */
export async function approveRequest(actor: AuthUser, requestId: string, ip: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    const req = await tx.changeRequest.findUnique({
      where: { id: requestId },
      select: { id: true, staffMemberId: true, staffMember: { select: { departmentId: true } }, items: true },
    });
    if (!req) throw new NotFoundError();
    guardReviewer(actor, req);

    const claim = await tx.changeRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "APPROVED", reviewedById: actor.id, reviewedAt: new Date() },
    });
    if (claim.count === 0) throw new RequestError("NOT_PENDING", "This request was already decided.");

    const staff = await tx.staffMember.findUniqueOrThrow({ where: { id: req.staffMemberId }, select: CURRENT_SELECT });
    const cur = toCurrentRecord(staff);
    const data: Record<string, unknown> = {};
    const fields: string[] = [];
    const stale = (what: string) => new RequestError("STALE", `The record changed after this request was submitted (${what}). Reject it and ask the employee to resubmit.`);
    const invalid = (what: string) => new RequestError("INVALID", `Request item is invalid (${what}).`);

    for (const item of req.items) {
      const oldV = item.oldValue as JsonValue;
      const newV = item.newValue as JsonValue;

      if (item.target === "STAFF_FIELD") {
        if (!(REQUEST_SCALAR_FIELDS as readonly string[]).includes(item.fieldKey)) throw invalid(item.fieldKey);
        const key = item.fieldKey as RequestScalarField;
        if ((cur.scalars[key] ?? null) !== (oldV ?? null)) throw stale(key);
        const parsed = requestFieldSchema[key].safeParse(newV);
        if (!parsed.success) throw invalid(key);
        data[key] = key === "dateOfBirth" ? toDate(parsed.data as string | null) : parsed.data;
        fields.push(key);
      } else if (item.target === "EDUCATION") {
        const level = item.recordKey ?? "";
        if (!(EDUCATION_LEVELS as readonly string[]).includes(level)) throw invalid("education level");
        const existing = staff.education.find((e) => e.level === level);
        if (!jsonEqual(existing ? eduRow(existing, level) : null, oldV)) throw stale(`education ${level}`);
        if (newV === null) {
          if (existing) await tx.educationRecord.delete({ where: { id: existing.id } });
        } else {
          const p = eduRowSchemaFor(level).safeParse(asFormValues(newV as { [k: string]: JsonValue }));
          if (!p.success) throw invalid(`education ${level}`);
          const row = { ...p.data, title: level === "OTHER" ? p.data.title : null, sortOrder: EDUCATION_LEVELS.indexOf(level as (typeof EDUCATION_LEVELS)[number]) };
          if (existing) await tx.educationRecord.update({ where: { id: existing.id }, data: row });
          else await tx.educationRecord.create({ data: { staffMemberId: req.staffMemberId, level: level as (typeof EDUCATION_LEVELS)[number], ...row } });
        }
        fields.push(`education:${level}`);
      } else if (item.target === "EXPERIENCE") {
        const slot = Number(item.recordKey);
        if (![1, 2, 3].includes(slot)) throw invalid("experience slot");
        const existing = cur.experience.find((e) => e.slot === slot);
        if (!jsonEqual(existing ? expRow(existing) : null, oldV)) throw stale(`experience ${slot}`);
        if (newV === null) {
          if (existing) await tx.experienceRecord.delete({ where: { id: existing.id } });
        } else {
          const p = expRowSchema.safeParse(asFormValues(newV as { [k: string]: JsonValue }));
          if (!p.success) throw invalid(`experience ${slot}`);
          const row = { organization: p.data.organization, designation: p.data.designation, startDate: toDate(p.data.startDate), endDate: toDate(p.data.endDate) };
          if (existing) await tx.experienceRecord.update({ where: { id: existing.id }, data: row });
          else await tx.experienceRecord.create({ data: { staffMemberId: req.staffMemberId, slot, ...row } });
        }
        fields.push(`experience:${slot}`);
      } else if (item.target === "PHOTO") {
        if (!item.photoFileId) throw invalid("photo");
        if ((oldV as { fileId?: string | null } | null)?.fileId !== staff.photoFileId && !(oldV === null && staff.photoFileId === null)) throw stale("photo");
        const asset = await tx.fileAsset.findUnique({ where: { id: item.photoFileId }, select: { ownerStaffId: true, purpose: true } });
        if (!asset || asset.purpose !== "PROFILE_PHOTO" || asset.ownerStaffId !== req.staffMemberId) throw invalid("photo");
        data.photoFileId = item.photoFileId;
        fields.push("photo");
      } else {
        throw invalid("target");
      }
    }

    await tx.staffMember.update({ where: { id: req.staffMemberId }, data: { ...data, version: { increment: 1 } } });
    await audit(tx, {
      actorId: actor.id, action: "request.approve", entityType: "ChangeRequest", entityId: requestId,
      metadata: { staffMemberId: req.staffMemberId, fields: fields.join(",") }, ip,
    });
  });
}

const reasonSchema = z.string().trim().min(3, "Give a reason (at least 3 characters).").max(500);

export async function rejectRequest(actor: AuthUser, requestId: string, rawReason: string, ip: string | null): Promise<void> {
  const reason = reasonSchema.safeParse(rawReason);
  if (!reason.success) throw new RequestError("INVALID", reason.error.issues[0]?.message ?? "Invalid reason");
  await db.$transaction(async (tx) => {
    const req = await tx.changeRequest.findUnique({
      where: { id: requestId }, select: { staffMemberId: true, staffMember: { select: { departmentId: true } } },
    });
    if (!req) throw new NotFoundError();
    guardReviewer(actor, req);
    const claim = await tx.changeRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "REJECTED", rejectionReason: reason.data, reviewedById: actor.id, reviewedAt: new Date() },
    });
    if (claim.count === 0) throw new RequestError("NOT_PENDING", "This request was already decided.");
    await audit(tx, { actorId: actor.id, action: "request.reject", entityType: "ChangeRequest", entityId: requestId, metadata: { staffMemberId: req.staffMemberId }, ip });
  });
}
