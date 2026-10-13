"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/authz";
import { ForbiddenError } from "@/server/authz/policy";
import { requestContext } from "@/server/auth/context";
import { createReference } from "@/server/staff/reference";

export interface RefState { error?: string; ok?: boolean }

const schema = z.object({ kind: z.enum(["department", "designation", "category"]), name: z.string().max(80) });

export async function addReferenceAction(_p: RefState, fd: FormData): Promise<RefState> {
  const actor = await requireUser();
  const parsed = schema.safeParse({ kind: fd.get("kind"), name: fd.get("name") });
  if (!parsed.success) return { error: "Invalid input." };
  try {
    const res = await createReference(actor, parsed.data.kind, parsed.data.name, (await requestContext()).ip);
    if (!res.ok) return { error: res.error };
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  revalidatePath("/reference");
  return { ok: true };
}
