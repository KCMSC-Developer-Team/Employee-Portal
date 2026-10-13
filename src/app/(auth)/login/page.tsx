"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <main className="mx-auto mt-24 max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold">K C Model School &amp; College</h1>
      <p className="mb-4 text-sm text-slate-600">Staff portal — authorised users only</p>
      <form action={action} className="space-y-3">
        <label className="block text-sm">
          Staff ID
          <input name="staffId" autoComplete="username" required maxLength={64}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          Password
          <input name="password" type="password" autoComplete="current-password" required maxLength={256}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        <button disabled={pending} className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
