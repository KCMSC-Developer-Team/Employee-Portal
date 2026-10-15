"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Building2, ClipboardList, Users, ShieldCheck, UserRoundCog, KeyRound, Settings, ChevronRight, CircleUserRound, LogOut, Menu, X } from "lucide-react";

export function MobileMenu({ role, email, name, designation, photoUrl }: { role: string; email: string; name: string; designation?: string | null; photoUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const links = [
    { href: "/dashboard", label: "Overview", icon: ClipboardList },
    { href: "/employees", label: "Employees", icon: Users },
    { href: "/requests", label: "Approvals", icon: ShieldCheck },
    { href: "/my-profile", label: "My profile", icon: UserRoundCog },
    { href: "/account-settings", label: "Account settings", icon: KeyRound },
    ...(role === "DEVELOPER" ? [{ href: "/accounts", label: "Accounts", icon: Settings }] : []),
  ];
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open]);
  return <>
    <button type="button" aria-label="Open navigation menu" aria-expanded={open} onClick={() => setOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100"><Menu size={22}/></button>
    {open && <div className="fixed inset-0 z-[60] md:hidden">
      <button aria-label="Close navigation menu" onClick={() => setOpen(false)} className="absolute inset-0 h-full w-full bg-slate-950/40 backdrop-blur-[1px]" />
      <aside role="dialog" aria-modal="true" aria-label="Workspace navigation" className="absolute inset-y-0 right-0 flex w-[min(86vw,340px)] flex-col border-l border-slate-200 bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-800 text-white"><Building2 size={20}/></div><div><div className="text-sm font-bold">KCMSC</div><div className="text-[10px] text-slate-500">EMPLOYEE MANAGEMENT</div></div></div><button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><X size={20}/></button></div>
        <div className="px-3 py-5"><div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</div><nav className="space-y-1">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${pathname === href || (href === "/employees" && pathname.startsWith("/employees")) ? "bg-emerald-50 text-emerald-900" : "text-slate-700 hover:bg-slate-50"}`}><Icon size={18}/><span>{label}</span><ChevronRight size={15} className="ml-auto text-slate-400"/></Link>)}</nav></div>
        <div className="mt-auto border-t border-slate-100 p-4"><Link href="/my-profile" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50">{photoUrl ? <img src={photoUrl} alt="" className="h-11 w-11 rounded-full object-cover"/> : <div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-100 text-emerald-900"><CircleUserRound size={21}/></div>}<div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{name || email.split("@")[0]}</div><div className="truncate text-xs text-slate-500">{designation || role.replaceAll("_", " ")}</div><div className="truncate text-xs text-slate-400">{email}</div></div></Link><form action="/api/logout" method="post"><button className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-600 hover:bg-slate-50"><LogOut size={18}/> Sign out</button></form><p className="px-3 pt-4 text-xs text-slate-400">K C Model School & College</p></div>
      </aside>
    </div>}
  </>;
}
