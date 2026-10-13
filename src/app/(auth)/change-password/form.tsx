"use client";

import { useActionState } from "react";
import type { FormState } from "../login/actions";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {});
  const input = "mt-1 w-full rounded border border-slate-300 px-3 py-2";
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">Current (temporary) password
        <input name="current" type="password" autoComplete="current-password" required className={input} />
      </label>
      <label className="block text-sm">New password (10+ characters, letters and digits)
        <input name="next" type="password" autoComplete="new-password" required minLength={10} className={input} />
      </label>
      <label className="block text-sm">Confirm new password
        <input name="confirm" type="password" autoComplete="new-password" required minLength={10} className={input} />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60">
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
