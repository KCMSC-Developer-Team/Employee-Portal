import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/authz";
import { ForbiddenError } from "@/server/authz/policy";
import { MAPPING_TARGETS, getBatch, listIssues, reconcile } from "@/server/import/service";
import { cancelAction, commitAction, mappingAction } from "../actions";
import { ActionButton, MappingForm } from "../forms";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let b, issues, rec;
  try {
    b = await getBatch(user, id);
    if (!b) notFound();
    [issues, rec] = await Promise.all([listIssues(user, id), reconcile(user, id)]);
  } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }

  const c = rec?.counts ?? {};
  const stat = (label: string, n: number | undefined, color: string) => (
    <div className="card p-4"><p className="text-xs text-slate-500">{label}</p><p className={`text-3xl font-semibold ${color}`}>{n ?? 0}</p></div>
  );
  const editable = ["UPLOADED", "MAPPED", "VALIDATED"].includes(b.status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><Link href="/import" className="text-xs text-slate-500 hover:underline">← Imports</Link>
          <h1 className="text-xl font-semibold">{b.originalName} <span className="badge bg-slate-100 text-slate-700">{b.status.toLowerCase()}</span></h1></div>
        <div className="flex gap-2">
          {issues.length > 0 && <a className="btn-ghost" href={`/api/import/${id}/issues`}>Download issue report</a>}
          {editable && <ActionButton action={cancelAction} id={id} variant="btn-ghost" confirm="Cancel this import and discard staged data?">Cancel import</ActionButton>}
        </div>
      </div>

      {editable && b.mapping && (
        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">1 · Map columns</h2>
          <MappingForm id={id} action={mappingAction} headers={b.mapping.headers} current={b.mapping.map} targets={MAPPING_TARGETS} />
        </section>
      )}

      {b.status !== "UPLOADED" && b.status !== "MAPPED" && rec && (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            {stat("Ready", c.VALID, "text-emerald-600")}{stat("Invalid", c.INVALID, "text-rose-600")}
            {stat("Duplicate", c.DUPLICATE, "text-amber-600")}{stat("Conflict", c.CONFLICT, "text-orange-600")}{stat("Imported", c.COMMITTED, "text-indigo-600")}
          </div>
          {b.status === "VALIDATED" && (
            <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-slate-600">{c.VALID ?? 0} row(s) will be created. Invalid, duplicate and conflicting rows are <strong>not</strong> imported and never merged. No accounts or passwords are created.</p>
              {(c.VALID ?? 0) > 0 && <ActionButton action={commitAction} id={id} confirm={`Create ${c.VALID} staff record(s)?`}>Commit import</ActionButton>}
            </section>
          )}
          {b.status === "COMMITTED" && (
            <section className="card p-5 text-sm">
              <h2 className="mb-1 font-semibold">Reconciliation</h2>
              <p>Rows accounted for: <strong>{rec.accountedFor ? "yes" : "NO — investigate"}</strong> · Imported: {rec.committed} · Verified in staff records: {rec.verifiedInDatabase} ·
                <span className={rec.committedMatches ? "text-emerald-700" : "text-rose-700"}> {rec.committedMatches ? "match" : "mismatch"}</span></p>
            </section>
          )}
        </>
      )}

      {issues.length > 0 && (
        <section className="card overflow-hidden">
          <h2 className="border-b border-slate-100 p-4 font-semibold">Issues <span className="text-xs font-normal text-slate-500">(first {issues.length}; the report has all)</span></h2>
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-2">Row</th><th>Field</th><th>Severity</th><th>Message</th></tr></thead>
            <tbody>{issues.map((i, k) => (
              <tr key={k} className="border-t border-slate-100"><td className="p-2">{i.rowNumber ?? "—"}</td><td>{i.column ?? "—"}</td>
                <td><span className={`badge ${i.severity === "ERROR" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{i.severity.toLowerCase()}</span></td><td>{i.message}</td></tr>))}</tbody></table>
        </section>
      )}
    </div>
  );
}
