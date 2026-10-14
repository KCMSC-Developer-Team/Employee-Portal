import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/authz";
import { can, scopeFor } from "@/server/authz/policy";
import { getDashboard, parseDashboardFilters } from "@/server/analytics/queries";
import { listReferenceData } from "@/server/staff/reference";
import { BarPanel, DonutPanel, TrendPanel } from "./Charts";

function MetricIcon({ kind }: { kind: "staff" | "requests" | "complete" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24">{kind === "staff" ? <><circle {...common} cx="9" cy="8" r="3.5"/><path {...common} d="M2.5 20c.7-3.2 2.9-4.8 6.5-4.8M16 5.5a3 3 0 0 1 0 5.8M15 15.5c3.4 0 5.5 1.5 6.2 4.5"/></> : kind === "requests" ? <><path {...common} d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/></> : <><circle {...common} cx="12" cy="12" r="9"/><path {...common} d="m8 12 2.5 2.5L16 9"/></>}</svg>;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const scope = scopeFor(user, "dashboard:read");
  if (scope !== "ALL" && scope.length === 0) notFound();

  const filters = parseDashboardFilters(await searchParams);
  const [data, refs] = await Promise.all([getDashboard(user, filters), listReferenceData()]);
  const departments = scope === "ALL" ? refs.departments : refs.departments.filter((item) => scope.includes(item.id));
  const complete = data.completeness.find((item) => item.name === "Complete")?.value ?? 0;
  const completionRate = data.total ? Math.round((complete / data.total) * 100) : 0;
  const pendingHref = can(user, "request:review") ? "/requests" : "/me/requests";

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div><span className="page-eyebrow">CAMPUS OPERATIONS</span><h1>Good to see you, {user.name.split(" ")[0]}.</h1><p>Here is the latest overview of your staff workspace.</p></div>
        <form method="get" className="dashboard-filters">
          <label><span>Department</span><select name="departmentId" defaultValue={filters.departmentId ?? ""} className="input" aria-label="Department"><option value="">All departments</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Period</span><select name="months" defaultValue={String(filters.months)} className="input" aria-label="Request window">{[6, 12, 24].map((month) => <option key={month} value={month}>Last {month} months</option>)}</select></label>
          <button className="btn dashboard-apply" type="submit">Update view</button>
        </form>
      </div>

      <section className="dashboard-metrics" aria-label="Key metrics">
        <article className="metric-card metric-card-primary"><div className="metric-card-top"><span className="metric-icon"><MetricIcon kind="staff"/></span><span className="metric-period">Current</span></div><p className="metric-label">Staff records</p><div className="metric-value-row"><strong>{data.total.toLocaleString()}</strong><span className="metric-trend">Directory</span></div><p className="metric-footnote">Records within your permitted scope</p></article>
        <article className="metric-card"><div className="metric-card-top"><span className="metric-icon amber"><MetricIcon kind="requests"/></span><span className="metric-period">Needs attention</span></div><p className="metric-label">Pending change requests</p><div className="metric-value-row"><strong>{data.pendingRequests.toLocaleString()}</strong>{data.pendingRequests > 0 && <Link href={pendingHref} className="metric-action">Review queue <span aria-hidden="true">↗</span></Link>}</div><p className="metric-footnote">Employee updates awaiting a decision</p></article>
        <article className="metric-card"><div className="metric-card-top"><span className="metric-icon sage"><MetricIcon kind="complete"/></span><span className="metric-period">Profile quality</span></div><p className="metric-label">Complete profiles</p><div className="metric-value-row"><strong>{completionRate}<small>%</small></strong><span className="metric-fraction">{complete} of {data.total}</span></div><div className="metric-progress" role="progressbar" aria-label="Profile completion rate" aria-valuenow={completionRate} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${completionRate}%` }}/></div><p className="metric-footnote">Profiles with all required information</p></article>
      </section>

      <section className="dashboard-chart-grid" aria-label="Workforce analytics">
        <div className="chart-panel chart-panel-wide"><div className="panel-heading"><div><span className="panel-eyebrow">WORKFORCE</span><h2>Staff distribution</h2><p>Understand the makeup of your campus team.</p></div><span className="panel-tag">Live data</span></div><div className="distribution-grid"><DonutPanel title="Employment status" data={data.byStatus}/><BarPanel title="By department" data={data.byDepartment}/></div></div>
        <div className="chart-panel chart-panel-side"><div className="panel-heading"><div><span className="panel-eyebrow">DATA QUALITY</span><h2>Profile completeness</h2><p>Progress across accessible staff records.</p></div></div><div className="completion-summary"><div className="completion-ring" style={{ "--completion": `${completionRate}%` } as React.CSSProperties}><div><strong>{completionRate}%</strong><span>complete</span></div></div><div className="completion-legend"><span><i className="legend-dot complete-dot"/>Complete <strong>{complete}</strong></span><span><i className="legend-dot incomplete-dot"/>Incomplete <strong>{Math.max(0, data.total - complete)}</strong></span></div></div></div>
      </section>

      <section className="dashboard-chart-grid dashboard-chart-grid-secondary">
        <div className="chart-panel"><div className="panel-heading"><div><span className="panel-eyebrow">ORGANISATION</span><h2>Staff by designation</h2><p>Position titles across the organisation.</p></div></div><BarPanel title="Designation breakdown" data={data.byDesignation}/></div>
        <div className="chart-panel"><div className="panel-heading"><div><span className="panel-eyebrow">EMPLOYMENT</span><h2>Employment category</h2><p>How staff members joined the institution.</p></div></div><DonutPanel title="Joined as" data={data.byCategory}/></div>
      </section>

      <section className="chart-panel trend-panel"><div className="panel-heading"><div><span className="panel-eyebrow">REQUEST ACTIVITY</span><h2>Change request trends</h2><p>Monthly submissions and outcomes over the selected period.</p></div><span className="panel-tag">{data.months} months</span></div><TrendPanel title="Monthly request activity" data={data.requestTrend}/></section>

      <section className="dashboard-bottom-grid"><div className="chart-panel"><div className="panel-heading"><div><span className="panel-eyebrow">REQUESTS</span><h2>Request status</h2><p>Current distribution of change requests.</p></div><Link href={pendingHref} className="subtle-link">Open requests <span aria-hidden="true">↗</span></Link></div><DonutPanel title="Change requests by status" data={data.requestsByStatus}/></div>
      {data.activity && <div className="chart-panel"><div className="panel-heading"><div><span className="panel-eyebrow">SECURITY</span><h2>Recent admin activity</h2><p>Action counts over the last 30 days.</p></div><span className="panel-tag">30 days</span></div><BarPanel title="Administrative actions" data={data.activity}/></div>}</section>
      <footer className="dashboard-footnote"><span className="footnote-mark"><MetricIcon kind="complete"/></span><p>Analytics are aggregated and permission-scoped. Personal identifiers and confidential observation content are not shown here.</p></footer>
    </div>
  );
}
