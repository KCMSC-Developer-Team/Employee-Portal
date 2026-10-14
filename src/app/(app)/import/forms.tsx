"use client";

import { useActionState } from "react";
import type { ImportState } from "./actions";

type Act = (p: ImportState, fd: FormData) => Promise<ImportState>;
const Msg = ({ s }: { s: ImportState }) =>
  s.error ? <p role="alert" className="text-sm text-rose-600">{s.error}</p> : s.ok ? <p role="status" className="text-sm text-emerald-700">{s.ok}</p> : null;

export function UploadForm({ action, label }: { action: Act; label: string }) {
  const [s, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="space-y-3">
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-6 text-center text-sm text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50/40">
        <span className="font-medium">{label}</span>
        <span className="text-xs">.xlsx, up to 5 MB, 2,000 rows</span>
        <input type="file" name="file" accept=".xlsx" required className="mt-2 text-xs" />
      </label>
      <button disabled={pending} className="btn">{pending ? "Uploading…" : "Upload"}</button>
      <Msg s={s} />
    </form>
  );
}

export function ActionButton({ action, id, children, variant = "btn", confirm }: { action: Act; id: string; children: React.ReactNode; variant?: "btn" | "btn-ghost"; confirm?: string }) {
  const [s, run, pending] = useActionState(action, {});
  return (
    <form action={run} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} className="inline-flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className={variant}>{pending ? "Working…" : children}</button>
      <Msg s={s} />
    </form>
  );
}

export function MappingForm({ id, action, headers, current, targets }: {
  id: string; action: Act; headers: string[]; current: Record<string, string>; targets: Array<{ key: string; label: string; required: boolean }>;
}) {
  const [s, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-2 sm:grid-cols-2">
        {headers.map((h) => (
          <label key={h} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <span className="truncate font-medium" title={h}>{h}</span>
            <select name={`map:${h}`} defaultValue={current[h] ?? ""} className="input max-w-[55%] !py-1">
              <option value="">Ignore this column</option>
              {targets.map((t) => <option key={t.key} value={t.key}>{t.label}{t.required ? " *" : ""}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="text-xs text-slate-500">Unmapped columns are ignored and never read. There is no password column: passwords are never imported.</p>
      <button disabled={pending} className="btn">{pending ? "Validating…" : "Save mapping & validate"}</button>
      <Msg s={s} />
    </form>
  );
}
