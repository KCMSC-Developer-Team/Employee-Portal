import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/authz";
import { scopeFor } from "@/server/authz/policy";
import { listObservationOverview } from "@/server/observation/service";

// Leader-only. Lists who has an observation and when it last changed — never the text itself.
export default async function ObservationsOverview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const scope = scopeFor(user, "observation:read");
  if (scope !== "ALL" && scope.length === 0) notFound(); // ordinary admins and employees: 404

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  const q = z.string().trim().max(64).catch("").parse(one("q") ?? "") || undefined;
  const page = z.coerce.number().int().min(1).max(10_000).catch(1).parse(one("page") ?? 1);
  const { rows, total, pageCount } = await listObservationOverview(user, { q, page });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Observations <span className="text-sm font-normal text-slate-500">({total} staff in your scope)</span></h1>
      <form className="flex gap-2" method="get">
        <input name="q" defaultValue={q} placeholder="Name or staff ID" maxLength={64} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
        <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm">Search</button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Name</th><th>ID</th><th>Designation</th><th>Department</th><th>Observation</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No staff found.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-2">{r.name}</td>
                <td>{r.staffId}</td>
                <td>{r.designation?.name ?? "—"}</td>
                <td>{r.department?.name ?? "—"}</td>
                <td className="text-slate-500">{r.observation ? `v${r.observation.version} · ${r.observation.updatedAt.toISOString().slice(0, 10)}` : "none"}</td>
                <td><Link className="underline" href={`/observations/${r.id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">Page {page} of {pageCount}</span>
        <span className="space-x-3">
          {page > 1 && <Link className="underline" href={`/observations?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`}>← Previous</Link>}
          {page < pageCount && <Link className="underline" href={`/observations?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`}>Next →</Link>}
        </span>
      </div>
    </div>
  );
}
