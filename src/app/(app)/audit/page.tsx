import Link from "next/link";
import { requirePermission } from "@/server/authz";
import { listAudit, parseAuditFilters } from "@/server/audit/queries";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("audit:read"); // institution-wide
  const f = parseAuditFilters(await searchParams);
  const { rows, total, pageCount } = await listAudit(user, f);
  const qs = (page: number) => {
    const p = new URLSearchParams();
    if (f.action) p.set("action", f.action);
    if (f.entityType) p.set("entityType", f.entityType);
    if (page > 1) p.set("page", String(page));
    return `/audit?${p.toString()}`;
  };
  const input = "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit log <span className="text-sm font-normal text-slate-500">({total})</span></h1>
      <form className="flex gap-2" method="get">
        <input name="action" defaultValue={f.action} placeholder="Action prefix, e.g. request." className={input} maxLength={60} />
        <input name="entityType" defaultValue={f.entityType} placeholder="Entity, e.g. StaffMember" className={input} maxLength={40} />
        <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm">Filter</button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">When (UTC)</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">No matching events.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="p-2 whitespace-nowrap">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td>{r.actor?.staffMember ? `${r.actor.staffMember.name} (${r.actor.staffMember.staffId})` : "system"}</td>
                <td>{r.action}</td>
                <td>{r.entityType}</td>
                <td className="font-mono text-xs text-slate-500">{r.metadata ? JSON.stringify(r.metadata) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">Page {f.page} of {pageCount}</span>
        <span className="space-x-3">
          {f.page > 1 && <Link className="underline" href={qs(f.page - 1)}>← Newer</Link>}
          {f.page < pageCount && <Link className="underline" href={qs(f.page + 1)}>Older →</Link>}
        </span>
      </div>
    </div>
  );
}
