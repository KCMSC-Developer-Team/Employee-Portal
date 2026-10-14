import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/authz";
import { canGrantRole, canGrantRoleFull } from "@/server/authz/policy";
import { canManageRoles, listAccountsWithRoles, listRoleCatalog } from "@/server/roles/service";
import { listReferenceData } from "@/server/staff/reference";
import { RoleRow } from "./row";

export default async function RolesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!canManageRoles(user)) notFound();

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  const q = z.string().trim().max(64).catch("").parse(one("q") ?? "") || undefined;
  const page = z.coerce.number().int().min(1).max(10_000).catch(1).parse(one("page") ?? 1);

  const [{ rows, total, pageCount }, catalog, refs] = await Promise.all([
    listAccountsWithRoles(user, { q, page }), listRoleCatalog(), listReferenceData(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Roles &amp; permissions <span className="text-sm font-normal text-slate-500">({total} accounts)</span></h1>
      <p className="text-xs text-slate-500">
        You cannot change your own roles. Leader roles can be granted only by a Leader with grant rights; ordinary administrator rights never include them.
      </p>
      <form className="flex gap-2" method="get">
        <input name="q" defaultValue={q} placeholder="Name or staff ID" maxLength={64} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
        <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm">Search</button>
      </form>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {rows.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No accounts found.</p>}
        {rows.map((a) => (
          <div key={a.id} className="grid gap-2 p-3 sm:grid-cols-3">
            <div className="text-sm">
              <p className="font-medium">{a.staffMember?.name}</p>
              <p className="text-xs text-slate-500">ID {a.staffMember?.staffId} · {a.accountStatus.toLowerCase().replace("_", " ")}</p>
            </div>
            <div className="sm:col-span-2">
              <RoleRow
                userId={a.id}
                departments={refs.departments}
                roles={a.roles.map((r) => ({
                  userRoleId: r.id, name: r.role.name, isLeader: r.role.isLeader, scope: r.department ? r.department.name : "all",
                  revocable: canGrantRole(user, a.id, r.role),
                }))}
                grantable={catalog.filter((c) => canGrantRoleFull(user, a.id, c)).map((c) => ({ id: c.id, name: c.name, isLeader: c.isLeader }))}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">Page {page} of {pageCount}</span>
        <span className="space-x-3">
          {page > 1 && <Link className="underline" href={`/roles?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`}>← Previous</Link>}
          {page < pageCount && <Link className="underline" href={`/roles?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`}>Next →</Link>}
        </span>
      </div>
    </div>
  );
}
