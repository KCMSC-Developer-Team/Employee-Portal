"use client";

import { useActionState } from "react";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_STATUS_LABEL } from "@/lib/labels";
import { accountAction, adminPhotoAction, changeStatusAction, type PanelState } from "./actions";

const box = "mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";
const Msg = ({ s }: { s: PanelState }) => (
  <>
    {s.error && <p role="alert" className="text-sm text-red-600">{s.error}</p>}
    {s.ok && <p className="text-sm text-green-700">{s.ok}</p>}
    {s.temporaryPassword && <p className="inline-block rounded bg-slate-100 px-3 py-1 font-mono text-base select-all">{s.temporaryPassword}</p>}
  </>
);

export function StatusPanel({ id, version, current }: { id: string; version: number; current: string }) {
  const [s, action, pending] = useActionState<PanelState, FormData>(changeStatusAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-sm">New status
          <select name="toStatus" defaultValue="" required className={box}>
            <option value="" disabled>Select…</option>
            {EMPLOYMENT_STATUSES.filter((x) => x !== current).map((x) => <option key={x} value={x}>{EMPLOYMENT_STATUS_LABEL[x]}</option>)}
          </select>
        </label>
        <label className="text-sm">Effective date
          <input type="date" name="effectiveDate" required defaultValue={new Date().toISOString().slice(0, 10)} className={box} />
        </label>
        <label className="text-sm">Reason / reference (optional)
          <input name="reason" maxLength={500} className={box} />
        </label>
      </div>
      <Msg s={s} />
      <button disabled={pending} className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-60">Update status</button>
    </form>
  );
}

export function AccountPanel({ staffId, hasAccount, status }: { staffId: string; hasAccount: boolean; status: string | null }) {
  const [s, action, pending] = useActionState<PanelState, FormData>(accountAction, {});
  const btn = "rounded border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-60";
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={staffId} />
      <p className="text-sm text-slate-600">Login account: <b>{hasAccount ? status?.toLowerCase().replace("_", " ") : "none"}</b></p>
      <div className="flex flex-wrap gap-2">
        {!hasAccount && <button name="intent" value="create" disabled={pending} className={btn}>Create account</button>}
        {hasAccount && <button name="intent" value="reset" disabled={pending} className={btn}>Reset password</button>}
        {hasAccount && status !== "DISABLED" && <button name="intent" value="disable" disabled={pending} className={btn}>Disable account</button>}
        {hasAccount && status === "DISABLED" && <button name="intent" value="enable" disabled={pending} className={btn}>Enable account</button>}
      </div>
      <Msg s={s} />
    </form>
  );
}

export function PhotoPanel({ id }: { id: string }) {
  const [s, action, pending] = useActionState<PanelState, FormData>(adminPhotoAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required className="block text-sm" />
      <Msg s={s} />
      <button disabled={pending} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-60">Upload photograph</button>
    </form>
  );
}
