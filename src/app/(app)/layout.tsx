import Link from "next/link";
import { requireUser } from "@/server/authz";
import { can, scopeFor } from "@/server/authz/policy";
import { canManageRoles } from "@/server/roles/service";
import { logoutAction } from "../actions";

// The layout is convenience (navigation). It is NOT the security boundary: every page and action re-checks.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const scope = scopeFor(user, "staff:read");
  const canStaff = scope === "ALL" || scope.length > 0;
  const canRef = scopeFor(user, "staff:update") === "ALL";
  const rs = scopeFor(user, "request:review");
  const canReview = rs === "ALL" || rs.length > 0;
  const os = scopeFor(user, "observation:read");
  const canObs = os === "ALL" || os.length > 0;
  const ds = scopeFor(user, "dashboard:read");
  const canDash = ds === "ALL" || ds.length > 0;
  const is = scopeFor(user, "import:run");
  const canImport = is === "ALL" || can(user, "observation:import");
  const canReport = can(user, "report:read");
  const link = "rounded-full px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900";
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2.5 text-sm">
          <span className="mr-3 flex items-center gap-2 font-semibold"><span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-600 to-teal-500 text-xs text-white">K</span>KCMSC Staff</span>
          {user.staffMemberId && <Link className={link} href="/me">My profile</Link>}
          {canDash && <Link className={link} href="/dashboard">Dashboard</Link>}
          {canStaff && <Link className={link} href="/staff">Staff</Link>}
          {canReview && <Link className={link} href="/requests">Requests</Link>}
          {can(user, "audit:read") && <Link className={link} href="/audit">Audit</Link>}
          {canReport && <Link className={link} href="/reports">Reports</Link>}
          {canImport && <Link className={link} href="/import">Import</Link>}
          {canObs && <Link className={link} href="/observations">Observations</Link>}
          {canManageRoles(user) && <Link className={link} href="/roles">Roles</Link>}
          {canRef && <Link className={link} href="/reference">Reference data</Link>}
          <span className="ml-auto hidden text-slate-500 sm:inline">{user.name}</span>
          <form action={logoutAction}><button className="btn-ghost !py-1.5">Sign out</button></form>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
