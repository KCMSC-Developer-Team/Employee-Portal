"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/authz";
import { ForbiddenError } from "@/server/authz/policy";
import { requestContext } from "@/server/auth/context";
import { ObservationConflictError, ObservationValidationError, saveObservation } from "@/server/observation/service";

export interface ObservationFormState { error?: string; ok?: string; body?: string }

const ids = z.object({ id: z.string().min(1).max(40), version: z.coerce.number().int().min(0) });

export async function saveObservationAction(_p: ObservationFormState, fd: FormData): Promise<ObservationFormState> {
  const user = await requireUser();
  const parsed = ids.safeParse({ id: fd.get("id"), version: fd.get("version") });
  if (!parsed.success) notFound();
  const body = typeof fd.get("body") === "string" ? (fd.get("body") as string) : "";
  try {
    await saveObservation(user, parsed.data.id, body, parsed.data.version, (await requestContext()).ip);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound(); // no hint that the record exists
    if (e instanceof ObservationValidationError || e instanceof ObservationConflictError) return { error: e.message, body };
    console.error("observation save failed", (e as { code?: string }).code ?? "unknown"); // never log content
    return { error: "Could not save. Please try again.", body };
  }
  revalidatePath(`/observations/${parsed.data.id}`);
  return { ok: "Saved." };
}
