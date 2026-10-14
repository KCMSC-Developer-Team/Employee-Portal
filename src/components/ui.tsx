import Link from "next/link";
import { ReactNode } from "react";
import { ShieldCheck, Users, ClipboardList, Settings, LogOut, Search, Bell, ChevronRight, Building2, CircleUserRound } from "lucide-react";

export function Brand() {
  return <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-800 text-white"><Building2 size={20}/></div><div><div className="text-sm font-bold tracking-tight">KCMSC</div><div className="text-[11px] text-slate-500">STAFF MANAGEMENT</div></div></div>;
}
export function Shell({ children, role, email }: { children: ReactNode; role: string; email: string }) {
  const links = [
    { href: "/dashboard", label: "Overview", icon: ClipboardList },
    { href: "/employees", label: "Employees", icon: Users },
    { href: "/requests", label: "Approvals", icon: ShieldCheck },
    ...(role === "DEVELOPER" ? [{ href: "/accounts", label: "Accounts", icon: Settings }] : [])
  ];
  return <div className="min-h-screen md:flex">
    <aside className="flex w-full flex-col border-r border-slate-200 bg-white md:fixed md:inset-y-0 md:w-64">
      <div className="border-b border-slate-100 px-6 py-5"><Brand/></div>
      <div className="px-4 py-5"><div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Workspace</div>
        <nav className="space-y-1">{links.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-900"><Icon size={17}/>{item.label}<ChevronRight size={14} className="ml-auto opacity-40"/></Link>; })}</nav>
      </div>
      <div className="mt-auto border-t border-slate-100 p-4"><div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-emerald-900"><CircleUserRound size={18}/></div><div className="min-w-0"><div className="truncate text-xs font-semibold">{email}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800">{role.replaceAll("_", " ")}</div></div></div><form action="/api/logout" method="post"><button className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"><LogOut size={16}/> Sign out</button></form></div>
    </aside>
    <main className="min-w-0 flex-1 md:ml-64"><header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur md:px-9"><div><div className="text-xs text-slate-400">K C Model School & College</div><div className="text-sm font-semibold">Employee workspace</div></div><div className="flex items-center gap-4"><div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-500 sm:flex"><Search size={14}/> Staff directory</div><button aria-label="Notifications" className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100"><Bell size={18}/><span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-600"/></button></div></header><div className="mx-auto max-w-[1500px] p-5 md:p-9">{children}</div></main>
  </div>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
 return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow && <div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-emerald-800">{eyebrow}</div>}<h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-[28px]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}</div>{action}</div>;
}
export function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
 return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">{label}</div><div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div><div className="mt-2 text-xs text-slate-400">{note}</div></div>;
}
