"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/authz";
import { changePassword } from "@/server/auth/login";
import { requestContext } from "@/server/auth/context";
import type { FormState } from "../login/actions";

const schema = z
  .object({
    current: z.string().min(1).max(256),
    next: z.string().min(1).max(256),
    confirm: z.string().min(1).max(256),
  })
  .refine((v) => v.next === v.confirm, { message: "New passwords do not match." });

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser({ allowPasswordChange: true });
  const parsed = schema.safeParse({ current: form.get("current"), next: form.get("next"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const result = await changePassword(user, parsed.data.current, parsed.data.next, await requestContext());
  if (!result.ok) return { error: result.error };
  redirect("/");
}
