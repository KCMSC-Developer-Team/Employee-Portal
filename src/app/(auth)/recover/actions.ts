"use server";

import { mailEnabled } from "@/lib/mail";
import { requestContext } from "@/server/auth/context";
import { requestPasswordRecovery } from "@/server/auth/recovery";

export interface RecoverState { message?: string }

export async function recoverAction(_p: RecoverState, fd: FormData): Promise<RecoverState> {
  if (!mailEnabled()) {
    return { message: "Email recovery is not enabled. Please ask an administrator to reset your password." };
  }
  await requestPasswordRecovery(String(fd.get("staffId") ?? ""), await requestContext());
  // Identical message whether or not the account/email exists.
  return { message: "If that staff ID has an email address on file, a reset link has been sent. It expires in 30 minutes." };
}
