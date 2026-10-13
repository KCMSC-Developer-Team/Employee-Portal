"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/authz";
import { ForbiddenError } from "@/server/authz/policy";
import { requestContext } from "@/server/auth/context";
import { NotFoundError } from "@/server/staff/mutations";
import { RequestError, approveRequest, rejectRequest } from "@/server/requests/service";

export interface ReviewState { error?: string }

const id = z.string().min(1).max(40);

function fail(e: unknown): ReviewState {
  if (e instanceof ForbiddenError || e instanceof NotFoundError) notFound();
  if (e instanceof RequestError) return { error: e.message };
  console.error("review failed", (e as { code?: string }).code ?? "unknown");
  return { error: "Could not complete the action. Please try again." };
}

export async function approveAction(_p: ReviewState, fd: FormData): Promise<ReviewState> {
  const actor = await requireUser();
  const rid = id.safeParse(fd.get("id"));
  if (!rid.success) notFound();
  try {
    await approveRequest(actor, rid.data, (await requestContext()).ip);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/requests");
  redirect("/requests");
}

export async function rejectAction(_p: ReviewState, fd: FormData): Promise<ReviewState> {
  const actor = await requireUser();
  const rid = id.safeParse(fd.get("id"));
  if (!rid.success) notFound();
  try {
    await rejectRequest(actor, rid.data, String(fd.get("reason") ?? ""), (await requestContext()).ip);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/requests");
  redirect("/requests");
}
