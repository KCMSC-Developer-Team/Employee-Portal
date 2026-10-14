import { notFound } from "next/navigation";
import { requireUser } from "@/server/authz";
import { can, scopeFor } from "@/server/authz/policy";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_STATUS_LABEL } from "@/lib/labels";
import { listReferenceData } from "@/server/staff/reference";

export default async function Reports() {
  const user = await requireUser();
  const s = scopeFor(user, "staff:read");
  if (!can(user, "report:read") || (s !== "ALL" && s.length === 0)) notFound();
  const refs = await listReferenceData();
  const depts = s === "ALL" ? refs.departments : refs.departments.filter((d) => s.includes(d.id));
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      <form method="get" action="/api/reports/staff" className="card grid gap-3 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><h2 className="font-semibold">Staff roster (CSV)</h2>
          <p className="text-sm text-slate-500">Name, designation, department, status, joining date, subject and contact details. Excludes NID/passport, date of birth, addresses and confidential records. Each export is logged.</p></div>
        <select name="departmentId" className="input" aria-label="Department"><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select name="status" className="input" aria-label="Status"><option value="">Any status</option>{EMPLOYMENT_STATUSES.map((x) => <option key={x} value={x}>{EMPLOYMENT_STATUS_LABEL[x]}</option>)}</select>
        <select name="designationId" className="input" aria-label="Designation"><option value="">Any designation</option>{refs.designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select name="categoryId" className="input" aria-label="Joined as"><option value="">Any category</option>{refs.categories.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <div className="sm:col-span-2"><button className="btn">Download CSV</button></div>
      </form>
    </div>
  );
}
