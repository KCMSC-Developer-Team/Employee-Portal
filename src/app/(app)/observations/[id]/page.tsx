import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/authz";
import { can, canWriteObservation } from "@/server/authz/policy";
import { listRevisions, observationTrail, readObservation } from "@/server/observation/service";
import { requestContext } from "@/server/auth/context";
import { ObservationForm } from "./form";

export default async function ObservationDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const r = await readObservation(user, id, (await requestContext()).ip);
  if (!r.allowed) notFound(); // missing, out of scope, or not permitted: identical 404

  const target = { staffMemberId: r.staff.id, departmentId: r.staff.departmentId };
  const writable = canWriteObservation(user, target);
  const isLeaderHere = can(user, "observation:read", { departmentId: r.staff.departmentId });
  const [revisions, trail] = isLeaderHere ? await Promise.all([listRevisions(user, id), observationTrail(user, id)]) : [[], []];
  const own = user.staffMemberId === r.staff.id;

  return (
    <div className="space-y-4">
      {isLeaderHere && <Link href="/observations" className="text-sm underline">← All observations</Link>}
      <h1 className="text-xl font-semibold">Observation — {r.staff.name} <span className="text-sm font-normal text-slate-500">(ID {r.staff.staffId})</span></h1>
      <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">Confidential leadership feedback. Visible only to the employee concerned and authorised Leaders.</p>

      {writable ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <ObservationForm id={r.staff.id} version={r.observation?.version ?? 0} initial={r.observation?.body ?? ""} />
        </section>
      ) : (
        <section className="whitespace-pre-line rounded-lg border border-slate-200 bg-white p-4 text-sm">
          {r.observation?.body ?? "No observation recorded."}
          {own && <p className="mt-3 text-xs text-slate-500">You cannot edit your own observation.</p>}
        </section>
      )}

      {revisions.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Revision history</h2>
          <ol className="space-y-3 text-sm">
            {revisions.map((v) => (
              <li key={v.version}>
                <p className="text-xs text-slate-500">v{v.version} · {v.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {v.editedBy.staffMember?.name ?? "system"}</p>
                <p className="whitespace-pre-line">{v.body}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {trail.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Access &amp; change trail</h2>
          <ul className="space-y-1 text-sm text-slate-600">
            {trail.map((t) => (
              <li key={t.id}>{t.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {t.action.replace("observation.", "")} · {t.actor?.staffMember?.name ?? "system"}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
