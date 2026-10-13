import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, type AuthUser } from "@/server/authz/policy";

export type ReferenceKind = "department" | "designation" | "category";

export async function listReferenceData() {
  const sel = { select: { id: true, name: true }, where: { isActive: true }, orderBy: { name: "asc" as const } };
  const [departments, designations, categories] = await Promise.all([
    db.department.findMany(sel), db.designation.findMany(sel), db.employmentCategory.findMany(sel),
  ]);
  return { departments, designations, categories };
}

const nameSchema = z.string().trim().min(2, "Name is too short").max(80);

/** Reference data is institution-wide, so it needs an institution-wide `staff:update` grant (no scope). */
export async function createReference(actor: AuthUser, kind: ReferenceKind, rawName: string, ip: string | null) {
  assertCan(actor, "staff:update");
  const parsed = nameSchema.safeParse(rawName);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid name" };
  const name = parsed.data;
  try {
    const row =
      kind === "department" ? await db.department.create({ data: { name } })
      : kind === "designation" ? await db.designation.create({ data: { name } })
      : await db.employmentCategory.create({ data: { name } });
    await audit(db, { actorId: actor.id, action: `reference.create.${kind}`, entityType: kind, entityId: row.id, ip });
    return { ok: true as const };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false as const, error: "That name already exists." };
    throw e;
  }
}
