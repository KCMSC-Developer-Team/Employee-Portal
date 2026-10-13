import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan, type AuthUser } from "@/server/authz/policy";

export const AUDIT_PAGE_SIZE = 50;

/**
 * Observation activity is NEVER visible through the ordinary audit log — not even that an edit happened.
 * (Leader-only observation history is a separate screen in Stage 5.)
 */
export const NOT_CONFIDENTIAL: Prisma.AuditEventWhereInput = {
  NOT: [
    { entityType: { in: ["LeaderObservation", "ObservationRevision", "ImportObservationRow"] } },
    { action: { startsWith: "observation." } },
    { action: { startsWith: "import.observation" } },
  ],
};

const SELECT = {
  id: true, action: true, entityType: true, entityId: true, metadata: true, createdAt: true,
  actor: { select: { staffMember: { select: { name: true, staffId: true } } } },
} satisfies Prisma.AuditEventSelect;

const filterSchema = z.object({
  action: z.string().trim().max(60).regex(/^[A-Za-z0-9_.:-]*$/).optional().catch(undefined),
  entityType: z.string().trim().max(40).regex(/^[A-Za-z]*$/).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
});
export function parseAuditFilters(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) || undefined;
  return filterSchema.parse({ action: one("action"), entityType: one("entityType"), page: one("page") ?? 1 });
}

export async function listAudit(user: AuthUser, f: z.infer<typeof filterSchema>) {
  assertCan(user, "audit:read"); // institution-wide only
  const where: Prisma.AuditEventWhereInput = {
    AND: [
      NOT_CONFIDENTIAL,
      ...(f.action ? [{ action: { startsWith: f.action } }] : []),
      ...(f.entityType ? [{ entityType: f.entityType }] : []),
    ],
  };
  const [total, rows] = await db.$transaction([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({ where, select: SELECT, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * AUDIT_PAGE_SIZE, take: AUDIT_PAGE_SIZE }),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}

/** Recent record history for one staff member (profile edits, requests, status/account changes). */
export async function recordHistory(user: AuthUser, staffMemberId: string, departmentId: string | null) {
  assertCan(user, "audit:read");
  void departmentId;
  return db.auditEvent.findMany({
    where: {
      AND: [NOT_CONFIDENTIAL, { OR: [{ entityType: "StaffMember", entityId: staffMemberId }, { metadata: { path: ["staffMemberId"], equals: staffMemberId } }] }],
    },
    select: SELECT, orderBy: { createdAt: "desc" }, take: 20,
  });
}
