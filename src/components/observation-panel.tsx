"use client";

import { useState } from "react";

type Observation = {
  id: string;
  subject: string;
  description: string;
  observationDate: string | Date;
};

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC" });
}

export function ObservationPanel({
  employeeId,
  initialObservations,
  canAdd,
}: {
  employeeId: string;
  initialObservations: Observation[];
  canAdd: boolean;
}) {
  const [observations, setObservations] = useState(initialObservations);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, date, subject, description }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Could not save observation.");
        return;
      }

      setObservations((current) =>
        [result.observation as Observation, ...current].sort(
          (a, b) =>
            new Date(b.observationDate).getTime() -
            new Date(a.observationDate).getTime(),
        ),
      );
      setDate(today());
      setSubject("");
      setDescription("");
      setOpen(false);
      setSuccess("Observation saved.");
    } catch {
      setError("Could not save observation. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Observations</h2>
          <p className="mt-1 text-xs text-slate-500">
            Restricted information, ordered by observation date.
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
            className="rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Add Observation
          </button>
        )}
      </div>

      {success && (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {success}
        </p>
      )}
      <div className="mt-4 space-y-3">
        {observations.map((observation) => (
          <article key={observation.id} className="rounded-xl bg-slate-50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{observation.subject}</h3>
              <time className="text-xs text-slate-500">
                {formatDate(observation.observationDate)}
              </time>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {observation.description}
            </p>
          </article>
        ))}
        {!observations.length && (
          <p className="py-4 text-sm text-slate-500">No observations recorded.</p>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="observation-dialog-title"
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl sm:p-6"
          >
            <h2 id="observation-dialog-title" className="text-lg font-semibold">
              Add Observation
            </h2>
            <form onSubmit={submit} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Date</span>
                <input
                  required
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Subject</span>
                <input
                  required
                  maxLength={160}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Description</span>
                <textarea
                  required
                  rows={5}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              {error && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save observation"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
