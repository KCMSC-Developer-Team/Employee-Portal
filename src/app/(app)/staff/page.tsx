import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/authz";
import { can, scopeFor } from "@/server/authz/policy";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_STATUS_LABEL } from "@/lib/labels";
import { listStaff, parseFilters, type StaffFilters } from "@/server/staff/queries";
import { listReferenceData } from "@/server/staff/reference";

type SP = Promise<Record<string, string | string[] | undefined>>;

function href(f: StaffFilters, page: number) {
  const p = new URLSearchParams();
  for (const k of ["q", "status", "departmentId", "designationId", "categoryId"] as const) if (f[k]) p.set(k, f[k]!);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/staff?${s}` : "/staff";
}

export default async function StaffList({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const scope = scopeFor(user, "staff:read");
  if (scope !== "ALL" && scope.length === 0) notFound();

  const f = parseFilters(await searchParams);
  const [{ rows, total, page, pageCount }, refs] = await Promise.all([listStaff(user, f), listReferenceData()]);
  const input = "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Staff <span className="text-sm font-normal text-slate-500">({total})</span></h1>
        {can(user, "staff:create") && <Link href="/staff/new" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Add staff</Link>}
      </div>

      <form className="flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={f.q} placeholder="Name or staff ID" className={input} maxLength={64} />
        <select name="status" defaultValue={f.status ?? ""} className={input}>
          <option value="">Any status</option>
          {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{EMPLOYMENT_STATUS_LABEL[s]}</option>)}
        </select>
        <select name="departmentId" defaultValue={f.departmentId ?? ""} className={input}>
          <option value="">Any department</option>
          {refs.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select name="designationId" defaultValue={f.designationId ?? ""} className={input}>
          <option value="">Any designation</option>
          {refs.designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select name="categoryId" defaultValue={f.categoryId ?? ""} className={input}>
          <option value="">Any “joined as”</option>
          {refs.categories.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm">Filter</button>
        <Link href="/staff" className="px-2 py-1.5 text-sm text-slate-500 underline">Reset</Link>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr><th className="p-2">Name</th><th>ID</th><th>Designation</th><th>Department</th><th>Employment</th><th>Login</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No staff match these filters.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-2"><Link className="underline" href={`/staff/${r.id}`}>{r.name}</Link></td>
                <td>{r.staffId}</td>
                <td>{r.designation?.name ?? "—"}</td>
                <td>{r.department?.name ?? "—"}</td>
                <td>{EMPLOYMENT_STATUS_LABEL[r.employmentStatus]}</td>
                <td className="text-slate-500">{r.account ? r.account.accountStatus.toLowerCase().replace("_", " ") : "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Page {page} of {pageCount}</span>
        <div className="space-x-3">
          {page > 1 && <Link className="underline" href={href(f, page - 1)}>← Previous</Link>}
          {page < pageCount && <Link className="underline" href={href(f, page + 1)}>Next →</Link>}
        </div>
      </div>
    </div>
  );
}
