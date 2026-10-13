import Link from "next/link";
import { requireUser } from "@/server/authz";
import { can, scopeFor } from "@/server/authz/policy";
import { logoutAction } from "../actions";

// The layout is convenience (navigation). It is NOT the security boundary: every page and action re-checks.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const scope = scopeFor(user, "staff:read");
  const canStaff = scope === "ALL" || scope.length > 0;
  const canRef = scopeFor(user, "staff:update") === "ALL";
  const rs = scopeFor(user, "request:review");
  const canReview = rs === "ALL" || rs.length > 0;
  const link = "text-slate-600 hover:text-slate-900";
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-5xl items-center gap-5 px-4 py-3 text-sm">
          <span className="font-semibold">KCMSC Staff</span>
          {user.staffMemberId && <Link className={link} href="/me">My profile</Link>}
          {canStaff && <Link className={link} href="/staff">Staff</Link>}
          {canReview && <Link className={link} href="/requests">Requests</Link>}
          {can(user, "audit:read") && <Link className={link} href="/audit">Audit</Link>}
          {canRef && <Link className={link} href="/reference">Reference data</Link>}
          <span className="ml-auto text-slate-500">{user.name}</span>
          <form action={logoutAction}><button className="text-slate-600 underline">Sign out</button></form>
        </nav>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </>
  );
}
