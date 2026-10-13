"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/authz";
import { requestContext } from "@/server/auth/context";
import { flattenErrors, formToFlat, parseRequestForm } from "@/lib/validation/staff";
import { FileRejectedError } from "@/server/files/storage";
import { RequestError, submitChangeRequest } from "@/server/requests/service";
import type { StaffFormState } from "@/components/StaffForm";

export async function submitRequestAction(_prev: StaffFormState, fd: FormData): Promise<StaffFormState> {
  const user = await requireUser();
  const values = formToFlat(fd);
  const parsed = parseRequestForm(fd);
  if (!parsed.success) return { error: "Please correct the highlighted fields.", fieldErrors: flattenErrors(parsed.error), values };

  const photoField = fd.get("photo");
  const photo = photoField instanceof File && photoField.size > 0 ? photoField : null;
  const rawNote = fd.get("note");
  const note = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim().slice(0, 500) : null;

  try {
    await submitChangeRequest(user, parsed.data, photo, note, (await requestContext()).ip);
  } catch (e) {
    if (e instanceof FileRejectedError) return { error: "Please correct the highlighted fields.", fieldErrors: { photo: e.message }, values };
    if (e instanceof RequestError) return { error: e.message, values };
    console.error("request submit failed", (e as { code?: string }).code ?? "unknown");
    return { error: "Could not submit your request. Please try again.", values };
  }
  redirect("/me/requests");
}
