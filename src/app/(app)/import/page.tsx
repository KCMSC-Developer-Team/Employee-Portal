import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/authz";
import { can, scopeFor } from "@/server/authz/policy";
import { listBatches } from "@/server/import/service";
import { listObservationImports } from "@/server/observation/service";
import { obsUploadAction, uploadAction } from "./actions";
import { UploadForm } from "./forms";

const tone: Record<string, string> = {
  COMMITTED: "bg-emerald-100 text-emerald-800", VALIDATED: "bg-indigo-100 text-indigo-800", MAPPED: "bg-sky-100 text-sky-800",
  UPLOADED: "bg-slate-100 text-slate-700", CANCELLED: "bg-slate-100 text-slate-500", FAILED: "bg-rose-100 text-rose-800",
};

export default async function ImportHome() {
  const user = await requireUser();
  const canStaff = scopeFor(user, "import:run") === "ALL" && scopeFor(user, "staff:create") === "ALL";
  const canObs = can(user, "observation:import");
  if (!canStaff && !canObs) notFound();

  const [batches, obs] = await Promise.all([canStaff ? listBatches(user) : [], canObs ? listObservationImports(user) : []]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Excel import</h1>
      {canStaff && (
        <section className="card space-y-4 p-5">
          <div><h2 className="font-semibold">Staff profiles</h2>
            <p className="text-sm text-slate-500">Upload → map columns → validate → review conflicts → commit. Nothing is written until you commit. Existing staff IDs are never overwritten.</p></div>
          <UploadForm action={uploadAction} label="Drop or choose a staff workbook" />
          <ul className="divide-y divide-slate-100">
            {batches.length === 0 && <li className="py-4 text-center text-sm text-slate-500">No imports yet.</li>}
            {batches.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                <Link className="font-medium underline-offset-2 hover:underline" href={`/import/${b.id}`}>{b.originalName}</Link>
                <span className="flex items-center gap-3 text-xs text-slate-500">{b.committedRows}/{b.totalRows} rows
                  <span className={`badge ${tone[b.status] ?? ""}`}>{b.status.toLowerCase()}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {canObs && (
        <section className="card space-y-4 border-amber-200 p-5">
          <div><h2 className="font-semibold">Observation migration <span className="badge bg-amber-100 text-amber-800">Leader only</span></h2>
            <p className="text-sm text-slate-500">Separate workbook with two columns: “Staff ID” and “Observation”. Uploading is your explicit authorisation. Existing observations are never overwritten, and only people inside your scope are accepted.</p></div>
          <UploadForm action={obsUploadAction} label="Choose an observation workbook" />
          <ul className="divide-y divide-slate-100">
            {obs.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                <Link className="font-medium hover:underline" href={`/import/observations/${b.id}`}>{b.originalName}</Link>
                <span className={`badge ${tone[b.status] ?? ""}`}>{b.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
