"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/authz";
import { can, ForbiddenError } from "@/server/authz/policy";
import { requestContext } from "@/server/auth/context";
import { flattenErrors, formToFlat, parseCreateForm, parseUpdateForm } from "@/lib/validation/staff";
import { ConflictError, NotFoundError, createStaff, updateStaff } from "@/server/staff/mutations";
import type { StaffFormState } from "@/components/StaffForm";

function mapError(e: unknown, values: Record<string, string>): StaffFormState {
  if (e instanceof ForbiddenError || e instanceof NotFoundError) notFound();
  if (e instanceof ConflictError) return { error: e.message, values };
  const code = (e as { code?: string }).code;
  if (code === "P2002") return { error: "Please correct the highlighted fields.", fieldErrors: { staffId: "This staff ID already exists." }, values };
  if (code === "P2003") return { error: "A selected department, designation or category no longer exists. Reload the form.", values };
  console.error("staff action failed", code ?? "unknown"); // code only: errors may embed personal data
  return { error: "Could not save. Please try again.", values };
}

export async function createStaffAction(_prev: StaffFormState, fd: FormData): Promise<StaffFormState> {
  const actor = await requireUser();
  const parsed = parseCreateForm(fd);
  if (!parsed.success) return { error: "Please correct the highlighted fields.", fieldErrors: flattenErrors(parsed.error), values: formToFlat(fd) };
  try {
    const ctx = await requestContext();
    const wantAccount = fd.get("createAccount") === "on";
    if (wantAccount && !can(actor, "account:manage")) return { error: "You are not allowed to create login accounts.", values: formToFlat(fd) };
    const res = await createStaff(actor, parsed.data, { createAccount: wantAccount, ip: ctx.ip });
    return { created: { id: res.id, staffId: parsed.data.staffId, name: parsed.data.name, temporaryPassword: res.temporaryPassword } };
  } catch (e) {
    return mapError(e, formToFlat(fd));
  }
}

const idSchema = z.object({ id: z.string().min(1).max(40), version: z.coerce.number().int().min(1) });

export async function updateStaffAction(_prev: StaffFormState, fd: FormData): Promise<StaffFormState> {
  const actor = await requireUser();
  const ids = idSchema.safeParse({ id: fd.get("id"), version: fd.get("version") });
  if (!ids.success) notFound();
  const parsed = parseUpdateForm(fd);
  if (!parsed.success) return { error: "Please correct the highlighted fields.", fieldErrors: flattenErrors(parsed.error), values: formToFlat(fd) };
  try {
    await updateStaff(actor, ids.data.id, parsed.data, ids.data.version, (await requestContext()).ip);
  } catch (e) {
    return mapError(e, formToFlat(fd));
  }
  redirect(`/staff/${ids.data.id}`);
}
