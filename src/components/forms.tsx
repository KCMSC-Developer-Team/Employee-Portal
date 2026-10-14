"use client";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function SignInForm() {
 const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const router=useRouter();
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError("");const result=await signIn("credentials",{email,password,redirect:false});setBusy(false);if(result?.error){setError("Email or password is incorrect, or the account is inactive.");return;}router.push("/dashboard");router.refresh();}
 return <form onSubmit={submit} className="mt-8 space-y-5"><label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">Email address</span><input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@institution.edu" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10"/></label><label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">Password</span><input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10"/></label>{error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-emerald-800 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:opacity-60">{busy?"Signing in…":"Sign in"}</button></form>;
}
