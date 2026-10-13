"use client";

import { useActionState } from "react";
import { recoverAction, type RecoverState } from "./actions";

export default function RecoverPage() {
  const [state, action, pending] = useActionState<RecoverState, FormData>(recoverAction, {});
  return (
    <main className="mx-auto mt-24 max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold">Recover your password</h1>
      <p className="mb-4 text-sm text-slate-600">Enter your staff ID. If the account has an email on file, we’ll send a reset link.</p>
      {state.message ? (
        <p role="status" className="text-sm text-slate-700">{state.message}</p>
      ) : (
        <form action={action} className="space-y-3">
          <label className="block text-sm">Staff ID
            <input name="staffId" required maxLength={64} autoComplete="username" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <button disabled={pending} className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60">Send reset link</button>
        </form>
      )}
      <p className="mt-4 text-center text-sm"><a href="/login" className="underline text-slate-600">Back to sign in</a></p>
    </main>
  );
}
