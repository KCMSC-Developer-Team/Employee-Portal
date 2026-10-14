import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/authz";
import { can, scopeFor } from "@/server/authz/policy";
import { getDashboard, parseDashboardFilters } from "@/server/analytics/queries";
import { listReferenceData } from "@/server/staff/reference";
import { BarPanel, DonutPanel, TrendPanel } from "./Charts";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const s = scopeFor(user, "dashboard:read");
  if (s !== "ALL" && s.length === 0) notFound();

  const f = parseDashboardFilters(await searchParams);
  const [d, refs] = await Promise.all([getDashboard(user, f), listReferenceData()]);
  const depts = s === "ALL" ? refs.departments : refs.departments.filter((x) => s.includes(x.id));
  const sel = "input";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Dashboard <span className="text-sm font-normal text-slate-500">({d.departmentLabel})</span></h1>
        <form method="get" className="flex flex-wrap gap-2">
          <select name="departmentId" defaultValue={f.departmentId ?? ""} className={sel} aria-label="Department">
            <option value="">All departments</option>
            {depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <select name="months" defaultValue={String(f.months)} className={sel} aria-label="Request window">
            {[6, 12, 24].map((m) => <option key={m} value={m}>Last {m} months</option>)}
          </select>
          <button className="btn-ghost">Apply</button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs text-slate-500">Staff records</p><p className="text-3xl font-semibold tracking-tight">{d.total}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Pending change requests</p><p className="text-3xl font-semibold tracking-tight">{d.pendingRequests}</p>
          {can(user, "request:review") && d.pendingRequests > 0 && <Link className="text-xs underline" href="/requests">Review</Link>}</div>
        <div className="card p-4"><p className="text-xs text-slate-500">Complete profiles</p>
          <p className="text-3xl font-semibold tracking-tight">{d.completeness.find((c) => c.name === "Complete")?.value ?? 0}<span className="text-sm font-normal text-slate-500"> / {d.total}</span></p></div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <DonutPanel title="Employment status" data={d.byStatus} />
        <DonutPanel title="Profile completeness" data={d.completeness} />
        <BarPanel title="Staff by designation" data={d.byDesignation} />
        <BarPanel title="Staff by department" data={d.byDepartment} />
        <DonutPanel title="Joined as" data={d.byCategory} />
        <DonutPanel title="Change requests by status" data={d.requestsByStatus} />
      </div>
      <TrendPanel title={`Change requests per month (last ${d.months} months)`} data={d.requestTrend} />
      {d.activity && <BarPanel title="Admin activity, last 30 days (action counts)" data={d.activity} />}
      <p className="text-xs text-slate-500">Charts show counts only. No personal or confidential details are included.</p>
    </div>
  );
}
