import Link from "next/link";
import { requireUser } from "@/server/authz";
import { can, scopeFor } from "@/server/authz/policy";
import { canManageRoles } from "@/server/roles/service";
import { logoutAction } from "../actions";

function Glyph({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    home: <><path {...common} d="m3 10 9-7 9 7"/><path {...common} d="M5 9v11h14V9M9 20v-6h6v6"/></>,
    user: <><circle {...common} cx="12" cy="8" r="3.5"/><path {...common} d="M5 20c.8-3.3 3.1-5 7-5s6.2 1.7 7 5"/></>,
    users: <><circle {...common} cx="9" cy="8" r="3"/><path {...common} d="M3 19c.5-2.7 2.5-4 6-4M16 5.5a3 3 0 0 1 0 5.8M16 15c2.7.1 4.3 1.4 5 4"/></>,
    requests: <><path {...common} d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/></>,
    audit: <><circle {...common} cx="12" cy="12" r="9"/><path {...common} d="M12 7v5l3 2"/></>,
    chart: <><path {...common} d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    import: <><path {...common} d="M12 15V3m-4 4 4-4 4 4M4 14v6h16v-6"/></>,
    shield: <><path {...common} d="M12 3 20 6v5c0 5-3.3 8.4-8 10-4.7-1.6-8-5-8-10V6zM9 12l2 2 4-4"/></>,
    book: <><path {...common} d="M4 4.5A3.5 3.5 0 0 1 7.5 3H20v17H7.5A3.5 3.5 0 0 0 4 23zM4 4.5V23"/></>,
    logout: <><path {...common} d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/></>,
  };
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">{paths[name] ?? paths.home}</svg>;
}

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
  const nav = [
    { href: "/", label: "Overview", icon: "home", show: true },
    { href: "/me", label: "My profile", icon: "user", show: Boolean(user.staffMemberId) },
    { href: "/dashboard", label: "Analytics", icon: "chart", show: canDash },
    { href: "/staff", label: "Staff directory", icon: "users", show: canStaff },
    { href: "/requests", label: "Change requests", icon: "requests", show: canReview },
    { href: "/observations", label: "Observations", icon: "book", show: canObs },
    { href: "/reports", label: "Reports", icon: "chart", show: canReport },
    { href: "/import", label: "Import centre", icon: "import", show: canImport },
    { href: "/audit", label: "Audit log", icon: "audit", show: can(user, "audit:read") },
    { href: "/roles", label: "Access control", icon: "shield", show: canManageRoles(user) },
    { href: "/reference", label: "Reference data", icon: "book", show: canRef },
  ];
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" href="/" aria-label="KCMSC Staff Portal home">
          <span className="workspace-brand-mark"><img src="/brand/kcmsc-mark.svg" alt="" /></span>
          <span><strong>KCMSC</strong><small>STAFF PORTAL</small></span>
        </Link>
        <div className="sidebar-caption">WORKSPACE</div>
        <nav className="workspace-nav" aria-label="Main navigation">
          {nav.filter((item) => item.show).map((item) => <Link className="workspace-navlink" href={item.href} key={item.href}><Glyph name={item.icon}/><span>{item.label}</span></Link>)}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-security"><span className="security-mark"><Glyph name="shield"/></span><span><strong>Secure workspace</strong><small>Access is permission-controlled</small></span></div></div>
      </aside>
      <div className="workspace-content">
        <header className="workspace-topbar">
          <div className="topbar-context"><span className="topbar-kicker">K C MODEL SCHOOL &amp; COLLEGE</span><strong>Employee management</strong></div>
          <div className="topbar-account"><span className="account-avatar">{user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><span className="account-name">{user.name}<small>Signed in</small></span><form action={logoutAction}><button className="signout-button" type="submit"><Glyph name="logout"/><span>Sign out</span></button></form></div>
        </header>
        <main className="portal-main">{children}</main>
      </div>
    </div>
  );
}
