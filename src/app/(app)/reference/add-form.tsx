"use client";

import { useActionState } from "react";
import { addReferenceAction, type RefState } from "./actions";

export function AddReferenceForm({ kind, label }: { kind: "department" | "designation" | "category"; label: string }) {
  const [state, action, pending] = useActionState<RefState, FormData>(addReferenceAction, {});
  return (
    <form action={action} className="mt-3 flex gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input name="name" required minLength={2} maxLength={80} placeholder={`New ${label}`}
        className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
      <button disabled={pending} className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-60">Add</button>
      {state.error && <span role="alert" className="self-center text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
