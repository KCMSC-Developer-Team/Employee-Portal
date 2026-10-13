"use client";

import { useActionState } from "react";
import { resetAction, type ResetState } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetAction, {});
  const input = "mt-1 w-full rounded border border-slate-300 px-3 py-2";
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm">New password (10+ characters, letters and digits)
        <input name="next" type="password" required minLength={10} autoComplete="new-password" className={input} />
      </label>
      <label className="block text-sm">Confirm new password
        <input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={input} />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60">Set password</button>
    </form>
  );
}
