"use server";

import { redirect } from "next/navigation";
import { requestContext } from "@/server/auth/context";
import { resetPasswordWithToken } from "@/server/auth/recovery";

export interface ResetState { error?: string }

export async function resetAction(_p: ResetState, fd: FormData): Promise<ResetState> {
  const token = String(fd.get("token") ?? "");
  const next = String(fd.get("next") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { error: "Passwords do not match." };
  const r = await resetPasswordWithToken(token, next, await requestContext());
  if (!r.ok) return { error: r.error };
  redirect("/login");
}
