import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { EMPLOYMENT_STATUSES } from "@/lib/labels";
import { assertCan, type AuthUser } from "@/server/authz/policy";
import { ConflictError, NotFoundError } from "./mutations";

export class StatusValidationError extends Error {}

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
};

const schema = z.object({
  toStatus: z.enum(EMPLOYMENT_STATUSES),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, "Invalid date"),
  reason: z.preprocess((v) => (typeof v === "string" ? v.trim() || null : null), z.string().max(500).nullable()),
  version: z.coerce.number().int().min(1),
});

/**
 * Changes EMPLOYMENT status only (resignation, retirement, leave…). It never touches the login account:
 * disabling access is a separate, explicit action (setAccountStatus). The record is never deleted; each
 * change appends an immutable EmploymentStatusEvent.
 */
export async function changeEmploymentStatus(actor: AuthUser, staffMemberId: string, raw: unknown, ip: string | null): Promise<void> {
  const p = schema.safeParse(raw);
  if (!p.success) throw new StatusValidationError(p.error.issues[0]?.message ?? "Invalid input");
  const input = p.data;

  const today = Date.now();
  if (new Date(`${input.effectiveDate}T00:00:00Z`).getTime() > today + 366 * 86_400_000) {
    throw new StatusValidationError("Effective date is too far in the future.");
  }

  const staff = await db.staffMember.findUnique({ where: { id: staffMemberId }, select: { employmentStatus: true, departmentId: true } });
  if (!staff) throw new NotFoundError();
  assertCan(actor, "staff:status", { departmentId: staff.departmentId });
  if (actor.staffMemberId === staffMemberId) throw new StatusValidationError("You cannot change your own employment status.");
  if (staff.employmentStatus === input.toStatus) throw new StatusValidationError("The staff member already has that status.");

  await db.$transaction(async (tx) => {
    const r = await tx.staffMember.updateMany({
      where: { id: staffMemberId, version: input.version },
      data: { employmentStatus: input.toStatus, version: { increment: 1 } },
    });
    if (r.count === 0) throw new ConflictError("This record was changed by someone else. Reload and try again.");
    await tx.employmentStatusEvent.create({
      data: {
        staffMemberId, fromStatus: staff.employmentStatus, toStatus: input.toStatus,
        effectiveDate: new Date(`${input.effectiveDate}T00:00:00.000Z`), reason: input.reason, recordedById: actor.id,
      },
    });
    await audit(tx, {
      actorId: actor.id, action: "staff.status_change", entityType: "StaffMember", entityId: staffMemberId,
      metadata: { from: staff.employmentStatus, to: input.toStatus }, ip,
    });
  });
}

export function listStatusHistory(staffMemberId: string) {
  return db.employmentStatusEvent.findMany({
    where: { staffMemberId }, orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }], take: 20,
    select: { id: true, fromStatus: true, toStatus: true, effectiveDate: true, reason: true, recordedBy: { select: { staffMember: { select: { name: true } } } } },
  });
}
