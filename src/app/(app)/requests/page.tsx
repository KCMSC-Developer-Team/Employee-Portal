import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/authz";
import { scopeFor } from "@/server/authz/policy";
import { listRequestsForReview, parseRequestFilters } from "@/server/requests/service";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

export default async function Requests({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const scope = scopeFor(user, "request:review");
  if (scope !== "ALL" && scope.length === 0) notFound();

  const f = parseRequestFilters(await searchParams);
  const { rows, total, pageCount } = await listRequestsForReview(user, f);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Change requests <span className="text-sm font-normal text-slate-500">({total})</span></h1>
      <div className="flex gap-3 text-sm">
        {STATUSES.map((s) => (
          <Link key={s} href={`/requests?status=${s}`} className={s === f.status ? "font-semibold underline" : "text-slate-600"}>{s.toLowerCase()}</Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Staff</th><th>ID</th><th>Items</th><th>Submitted</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">No {f.status.toLowerCase()} requests.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-2">{r.staffMember.name}</td>
                <td>{r.staffMember.staffId}</td>
                <td>{r._count.items}</td>
                <td>{r.createdAt.toISOString().slice(0, 10)}</td>
                <td><Link className="underline" href={`/requests/${r.id}`}>Review</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">Page {f.page} of {pageCount}</span>
        <span className="space-x-3">
          {f.page > 1 && <Link className="underline" href={`/requests?status=${f.status}&page=${f.page - 1}`}>← Previous</Link>}
          {f.page < pageCount && <Link className="underline" href={`/requests?status=${f.status}&page=${f.page + 1}`}>Next →</Link>}
        </span>
      </div>
    </div>
  );
}
