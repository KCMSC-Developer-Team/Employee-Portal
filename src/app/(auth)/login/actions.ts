"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login } from "@/server/auth/login";
import { requestContext } from "@/server/auth/context";

export interface FormState {
  error?: string;
}

const schema = z.object({
  staffId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = schema.safeParse({ staffId: form.get("staffId"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your staff ID and password." };

  const result = await login(parsed.data.staffId, parsed.data.password, await requestContext());
  if (!result.ok) {
    return { error: result.error === "RATE_LIMITED" ? "Too many attempts. Please try again later." : "Invalid staff ID or password." };
  }
  redirect(result.mustChangePassword ? "/change-password" : "/");
}
