import { notFound } from "next/navigation";
import { requireUser } from "@/server/authz";
import { readOwnObservation } from "@/server/observation/service";

// Employee: read-only view of their OWN observation; the target comes from the session, never the URL.
export default async function MyObservation() {
  const user = await requireUser();
  const r = await readOwnObservation(user);
  if (!r.allowed) notFound();
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">My observation</h1>
      <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">Confidential. Only you and authorised Leaders can see this. You cannot edit it.</p>
      <section className="whitespace-pre-line rounded-lg border border-slate-200 bg-white p-4 text-sm">
        {r.observation ? r.observation.body : "No observation has been recorded."}
      </section>
      {r.observation && <p className="text-xs text-slate-500">Last updated {r.observation.updatedAt.toISOString().slice(0, 10)}</p>}
    </div>
  );
}
