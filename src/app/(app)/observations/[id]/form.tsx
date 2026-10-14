"use client";

import { useActionState } from "react";
import { saveObservationAction, type ObservationFormState } from "../actions";

export function ObservationForm({ id, version, initial }: { id: string; version: number; initial: string }) {
  const [state, action, pending] = useActionState<ObservationFormState, FormData>(saveObservationAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <textarea name="body" required rows={10} maxLength={10_000} defaultValue={state.body ?? initial}
        className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm" />
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60">
        {version === 0 ? "Add observation" : "Save new version"}
      </button>
      <p className="text-xs text-slate-500">Every save is kept as a revision. Observations cannot be deleted.</p>
    </form>
  );
}
