import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/authz";
import { ForbiddenError } from "@/server/authz/policy";
import { getObservationImport } from "@/server/observation/service";
import { obsCancelAction, obsCommitAction } from "../../actions";
import { ActionButton } from "../../forms";

// Counts and issue codes only — the staged text is never rendered anywhere.
export default async function ObsBatch({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let b;
  try { b = await getObservationImport(user, id); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  if (!b) notFound();
  return (
    <div className="space-y-5">
      <Link href="/import" className="text-xs text-slate-500 hover:underline">← Imports</Link>
      <h1 className="text-xl font-semibold">Observation migration <span className="badge bg-amber-100 text-amber-800">{b.status.toLowerCase()}</span></h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs text-slate-500">Rows in file</p><p className="text-3xl font-semibold">{b.totalRows}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Ready to migrate</p><p className="text-3xl font-semibold text-emerald-600">{b.status === "COMMITTED" ? b.committedRows : b.staged}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Rejected</p><p className="text-3xl font-semibold text-rose-600">{b.issues.length}</p></div>
      </div>
      {b.status === "VALIDATED" && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-slate-600">Only you can commit this batch. Existing observations are never overwritten; each migrated entry gets a revision and a Leader-only audit entry.</p>
          <div className="flex gap-2">
            <ActionButton action={obsCancelAction} id={id} variant="btn-ghost" confirm="Discard the staged text?">Cancel</ActionButton>
            {b.staged > 0 && <ActionButton action={obsCommitAction} id={id} confirm={`Migrate ${b.staged} observation(s)?`}>Commit migration</ActionButton>}
          </div>
        </div>
      )}
      {b.issues.length > 0 && (
        <div className="card overflow-hidden"><table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-2">Row</th><th>Code</th><th>Message</th></tr></thead>
          <tbody>{b.issues.map((i, k) => <tr key={k} className="border-t border-slate-100"><td className="p-2">{i.rowNumber ?? "—"}</td><td>{i.code}</td><td>{i.message}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}
