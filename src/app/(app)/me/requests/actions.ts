"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/authz";
import { requestContext } from "@/server/auth/context";
import { RequestError, cancelOwnRequest } from "@/server/requests/service";

export interface CancelState { error?: string }

export async function cancelRequestAction(_p: CancelState, fd: FormData): Promise<CancelState> {
  const user = await requireUser();
  const id = z.string().min(1).max(40).safeParse(fd.get("id"));
  if (!id.success) return { error: "Invalid request." };
  try {
    await cancelOwnRequest(user, id.data, (await requestContext()).ip);
  } catch (e) {
    return { error: e instanceof RequestError ? e.message : "Could not cancel." };
  }
  revalidatePath("/me/requests");
  return {};
}
