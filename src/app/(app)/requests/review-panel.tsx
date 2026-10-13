"use client";

import { useActionState } from "react";
import { approveAction, rejectAction, type ReviewState } from "./actions";

export function ReviewPanel({ id }: { id: string }) {
  const [a, approve, approving] = useActionState<ReviewState, FormData>(approveAction, {});
  const [r, reject, rejecting] = useActionState<ReviewState, FormData>(rejectAction, {});
  const busy = approving || rejecting;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form action={approve} className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-4">
        <input type="hidden" name="id" value={id} />
        <p className="text-sm">Applies every change below to the official record in one step.</p>
        {a.error && <p role="alert" className="text-sm text-red-700">{a.error}</p>}
        <button disabled={busy} className="rounded bg-green-700 px-4 py-2 text-sm text-white disabled:opacity-60">Approve</button>
      </form>
      <form action={reject} className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-4">
        <input type="hidden" name="id" value={id} />
        <label className="block text-sm">Reason for rejection (shown to the employee)
          <textarea name="reason" required minLength={3} maxLength={500} rows={2} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
        </label>
        {r.error && <p role="alert" className="text-sm text-red-700">{r.error}</p>}
        <button disabled={busy} className="rounded bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-60">Reject</button>
      </form>
    </div>
  );
}
