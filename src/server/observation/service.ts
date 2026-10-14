/**
 * THE ONLY module (with the Stage 6 observation-import commit) allowed to touch the LeaderObservation /
 * ObservationRevision tables. A static security test enforces this. Every function re-checks authorization
 * itself — callers (pages, actions) are never trusted.
 *
 * Rules: employee = read own only; Leader = read/write within scope, never their own; ordinary admin = nothing.
 * No delete exists anywhere. Audit rows carry ids and version numbers, never text.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  ForbiddenError, can, canViewObservation, canWriteObservation, scopeFor, type AuthUser,
} from "@/server/authz/policy";

export class ObservationConflictError extends Error {}
export class ObservationValidationError extends Error {}

const bodySchema = z.string().trim().min(1, "Observation cannot be empty.").max(10_000, "Observation is too long (10,000 characters max).");
export const OBSERVATION_PAGE_SIZE = 25;

const staffTarget = (id: string) =>
  db.staffMember.findUnique({ where: { id }, select: { id: true, staffId: true, name: true, departmentId: true } });

export interface ObservationView { body: string; version: number; updatedAt: Date }

export type ReadResult =
  | { allowed: false }
  | { allowed: true; staff: { id: string; staffId: string; name: string; departmentId: string | null }; observation: ObservationView | null };

/** Employee concerned or in-scope Leader. Anything else → { allowed: false } (callers render a 404). */
export async function readObservation(user: AuthUser, staffMemberId: string, ip: string | null = null): Promise<ReadResult> {
  const t = await staffTarget(staffMemberId);
  if (!t || !canViewObservation(user, { staffMemberId: t.id, departmentId: t.departmentId })) return { allowed: false };

  const obs = await db.leaderObservation.findUnique({
    where: { staffMemberId: t.id }, select: { id: true, body: true, version: true, updatedAt: true },
  });
  // Leader views of someone else's observation are audited (id only). Self-views are not.
  if (obs && user.staffMemberId !== t.id) {
    await audit(db, { actorId: user.id, action: "observation.view", entityType: "LeaderObservation", entityId: obs.id, metadata: { staffMemberId: t.id }, ip });
  }
  return { allowed: true, staff: t, observation: obs ? { body: obs.body, version: obs.version, updatedAt: obs.updatedAt } : null };
}

/** Employee portal: the target is the session's own staff member, never a client-supplied id. */
export async function readOwnObservation(user: AuthUser) {
  if (!user.staffMemberId) return { allowed: false as const };
  return readObservation(user, user.staffMemberId);
}

/**
 * Create or edit. `expectedVersion` is 0 when no observation exists yet. Optimistic concurrency: a stale version
 * throws ObservationConflictError. Every successful write appends an immutable revision. There is no delete.
 */
export async function saveObservation(
  user: AuthUser, staffMemberId: string, rawBody: string, expectedVersion: number, ip: string | null,
): Promise<{ version: number }> {
  const t = await staffTarget(staffMemberId);
  if (!t || !canWriteObservation(user, { staffMemberId: t.id, departmentId: t.departmentId })) throw new ForbiddenError();

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) throw new ObservationValidationError(parsed.error.issues[0]?.message ?? "Invalid observation.");
  const body = parsed.data;

  try {
    return await db.$transaction(async (tx) => {
      const cur = await tx.leaderObservation.findUnique({ where: { staffMemberId: t.id }, select: { id: true, version: true, body: true } });

      if (!cur) {
        if (expectedVersion !== 0) throw new ObservationConflictError("This observation changed. Reload and try again.");
        const created = await tx.leaderObservation.create({
          data: { staffMemberId: t.id, body, version: 1, createdById: user.id, updatedById: user.id },
          select: { id: true },
        });
        await tx.observationRevision.create({ data: { observationId: created.id, version: 1, body, editedById: user.id } });
        await audit(tx, { actorId: user.id, action: "observation.create", entityType: "LeaderObservation", entityId: created.id, metadata: { staffMemberId: t.id, version: 1 }, ip });
        return { version: 1 };
      }

      if (cur.version !== expectedVersion) throw new ObservationConflictError("This observation was changed by someone else. Reload and try again.");
      if (cur.body === body) return { version: cur.version }; // nothing to record

      const next = cur.version + 1;
      const r = await tx.leaderObservation.updateMany({
        where: { id: cur.id, version: cur.version }, data: { body, version: next, updatedById: user.id },
      });
      if (r.count === 0) throw new ObservationConflictError("This observation was changed by someone else. Reload and try again.");
      await tx.observationRevision.create({ data: { observationId: cur.id, version: next, body, editedById: user.id } });
      await audit(tx, { actorId: user.id, action: "observation.update", entityType: "LeaderObservation", entityId: cur.id, metadata: { staffMemberId: t.id, version: next }, ip });
      return { version: next };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new ObservationConflictError("This observation was created by someone else. Reload and try again.");
    throw e;
  }
}

/** Revision history: Leaders in scope only (an employee sees their current observation, not its history). */
export async function listRevisions(user: AuthUser, staffMemberId: string) {
  const t = await staffTarget(staffMemberId);
  if (!t || !can(user, "observation:read", { departmentId: t.departmentId })) throw new ForbiddenError();
  const obs = await db.leaderObservation.findUnique({ where: { staffMemberId: t.id }, select: { id: true } });
  if (!obs) return [];
  return db.observationRevision.findMany({
    where: { observationId: obs.id }, orderBy: { version: "desc" },
    select: { version: true, body: true, createdAt: true, editedBy: { select: { staffMember: { select: { name: true } } } } },
  });
}

/** Leader-only audit trail for one staff member's observation (hidden from the ordinary audit log). */
export async function observationTrail(user: AuthUser, staffMemberId: string) {
  const t = await staffTarget(staffMemberId);
  if (!t || !can(user, "observation:read", { departmentId: t.departmentId })) throw new ForbiddenError();
  return db.auditEvent.findMany({
    where: { action: { startsWith: "observation." }, metadata: { path: ["staffMemberId"], equals: t.id } },
    orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, action: true, createdAt: true, metadata: true, actor: { select: { staffMember: { select: { name: true } } } } },
  });
}

/** Overview for Leaders: who has an observation and when it last changed — never the text. */
export async function listObservationOverview(user: AuthUser, f: { q?: string; page: number }) {
  const scope = scopeFor(user, "observation:read");
  if (scope !== "ALL" && scope.length === 0) throw new ForbiddenError();
  const where = {
    ...(scope === "ALL" ? {} : { departmentId: { in: scope } }),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" as const } }, { staffId: { contains: f.q, mode: "insensitive" as const } }] } : {}),
  };
  const [total, rows] = await db.$transaction([
    db.staffMember.count({ where }),
    db.staffMember.findMany({
      where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (f.page - 1) * OBSERVATION_PAGE_SIZE, take: OBSERVATION_PAGE_SIZE,
      select: {
        id: true, staffId: true, name: true, designation: { select: { name: true } }, department: { select: { name: true } },
        observation: { select: { version: true, updatedAt: true } }, // metadata only — body is not selected
      },
    }),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / OBSERVATION_PAGE_SIZE)) };
}
