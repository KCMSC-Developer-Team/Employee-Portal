"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/server/authz";
import { assertCan, ForbiddenError } from "@/server/authz/policy";
import { requestContext } from "@/server/auth/context";
import { createAccountForStaff, resetCredential, setAccountStatus } from "@/server/auth/credentials";
import { FileRejectedError, storeProfilePhoto } from "@/server/files/storage";
import { ConflictError, NotFoundError } from "@/server/staff/mutations";
import { StatusValidationError, changeEmploymentStatus } from "@/server/staff/status";

export interface PanelState { error?: string; ok?: string; temporaryPassword?: string }

const id = z.string().min(1).max(40);

function fail(e: unknown): PanelState {
  if (e instanceof ForbiddenError || e instanceof NotFoundError) notFound();
  if (e instanceof StatusValidationError || e instanceof ConflictError || e instanceof FileRejectedError) return { error: e.message };
  console.error("staff panel action failed", (e as { code?: string }).code ?? "unknown");
  return { error: "Could not complete the action." };
}

export async function changeStatusAction(_p: PanelState, fd: FormData): Promise<PanelState> {
  const actor = await requireUser();
  const sid = id.safeParse(fd.get("id"));
  if (!sid.success) notFound();
  try {
    await changeEmploymentStatus(actor, sid.data, {
      toStatus: fd.get("toStatus"), effectiveDate: fd.get("effectiveDate"), reason: fd.get("reason"), version: fd.get("version"),
    }, (await requestContext()).ip);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/staff/${sid.data}`);
  return { ok: "Employment status updated. The login account was not changed." };
}

const intent = z.enum(["reset", "disable", "enable", "create"]);

export async function accountAction(_p: PanelState, fd: FormData): Promise<PanelState> {
  const actor = await requireUser();
  const sid = id.safeParse(fd.get("id"));
  const what = intent.safeParse(fd.get("intent"));
  if (!sid.success || !what.success) notFound();
  const ip = (await requestContext()).ip;
  try {
    if (what.data === "create") {
      const r = await createAccountForStaff(actor, sid.data, ip);
      if (!r.ok) return { error: r.error === "EXISTS" ? "This staff member already has an account." : "Not found." };
      revalidatePath(`/staff/${sid.data}`);
      return { ok: "Account created. One-time password (shown once):", temporaryPassword: r.temporaryPassword };
    }
    const target = await db.userAccount.findUnique({ where: { staffMemberId: sid.data }, select: { id: true } });
    if (!target) notFound();
    if (what.data === "reset") {
      const r = await resetCredential(actor, target.id, ip);
      if (!r.ok) return { error: "You are not allowed to manage this account." };
      return { ok: "Password reset. One-time password (shown once):", temporaryPassword: r.temporaryPassword };
    }
    const r = await setAccountStatus(actor, target.id, what.data === "disable" ? "DISABLED" : "ACTIVE", ip);
    if (!r.ok) return { error: "You are not allowed to manage this account." };
    revalidatePath(`/staff/${sid.data}`);
    return { ok: what.data === "disable" ? "Account disabled and sessions ended." : "Account enabled." };
  } catch (e) {
    return fail(e);
  }
}

/** Admin sets/replaces the official photograph directly (employees must go through a change request). */
export async function adminPhotoAction(_p: PanelState, fd: FormData): Promise<PanelState> {
  const actor = await requireUser();
  const sid = id.safeParse(fd.get("id"));
  const file = fd.get("photo");
  if (!sid.success) notFound();
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photograph." };
  try {
    const staff = await db.staffMember.findUnique({ where: { id: sid.data }, select: { departmentId: true } });
    if (!staff) notFound();
    assertCan(actor, "staff:update", { departmentId: staff.departmentId });
    const asset = await storeProfilePhoto(file, { ownerStaffId: sid.data, uploadedById: actor.id });
    await db.$transaction(async (tx) => {
      await tx.staffMember.update({ where: { id: sid.data }, data: { photoFileId: asset.id, version: { increment: 1 } } });
      await audit(tx, { actorId: actor.id, action: "staff.photo_update", entityType: "StaffMember", entityId: sid.data, ip: null });
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/staff/${sid.data}`);
  return { ok: "Photograph updated." };
}
