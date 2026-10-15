"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RequestActions({
  requestId,
  hasChanges,
  canReview,
}: {
  requestId: string;
  hasChanges: boolean;
  canReview: boolean;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const router = useRouter();

  async function act(action: "approve" | "reject") {
    if (busy || !canReview || (action === "approve" && !hasChanges)) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Action failed. Please try again.");
        return;
      }
      setSuccess(result.message || "Request reviewed.");
      router.refresh();
    } catch {
      setError("Unable to review this request. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-slate-600">
          Reviewer note (optional)
        </span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Add a note for the employee"
          className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-700"
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!canReview && (
        <p className="mt-2 text-sm text-amber-800">
          You cannot review a profile request that you submitted.
        </p>
      )}
      {success && (
        <p role="status" className="mt-2 text-sm text-emerald-800">
          {success}
        </p>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy || !canReview}
          onClick={() => act("reject")}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 disabled:opacity-50"
        >
          {busy ? "Processing…" : "Reject"}
        </button>
        <button
          type="button"
          disabled={busy || !canReview || !hasChanges}
          onClick={() => act("approve")}
          title={!hasChanges ? "There are no effective changes to apply." : undefined}
          className="rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Processing…" : "Approve and apply"}
        </button>
      </div>
    </div>
  );
}
