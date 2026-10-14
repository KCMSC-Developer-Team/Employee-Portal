"use client";

import { useActionState } from "react";
import { grantRoleAction, revokeRoleAction, type RoleState } from "./actions";

interface Props {
  userId: string;
  roles: Array<{ userRoleId: string; name: string; isLeader: boolean; scope: string; revocable: boolean }>;
  grantable: Array<{ id: string; name: string; isLeader: boolean }>;
  departments: Array<{ id: string; name: string }>;
}

function Revoke({ userRoleId }: { userRoleId: string }) {
  const [s, action, pending] = useActionState<RoleState, FormData>(revokeRoleAction, {});
  return (
    <form action={action} className="inline">
      <input type="hidden" name="userRoleId" value={userRoleId} />
      <button disabled={pending} className="ml-1 text-xs text-red-700 underline disabled:opacity-60">revoke</button>
      {s.error && <span role="alert" className="ml-1 text-xs text-red-600">{s.error}</span>}
    </form>
  );
}

export function RoleRow({ userId, roles, grantable, departments }: Props) {
  const [s, action, pending] = useActionState<RoleState, FormData>(grantRoleAction, {});
  const sel = "rounded border border-slate-300 bg-white px-2 py-1 text-xs";
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2 text-xs">
        {roles.length === 0 && <li className="text-slate-400">no roles</li>}
        {roles.map((r) => (
          <li key={r.userRoleId} className={`rounded px-2 py-0.5 ${r.isLeader ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-700"}`}>
            {r.name} · {r.scope}{r.revocable && <Revoke userRoleId={r.userRoleId} />}
          </li>
        ))}
      </ul>
      {grantable.length > 0 && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="userId" value={userId} />
          <select name="roleId" required defaultValue="" className={sel}>
            <option value="" disabled>Grant role…</option>
            {grantable.map((g) => <option key={g.id} value={g.id}>{g.name}{g.isLeader ? " (Leader)" : ""}</option>)}
          </select>
          <select name="departmentId" defaultValue="" className={sel}>
            <option value="">Institution-wide</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name} only</option>)}
          </select>
          <button disabled={pending} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-60">Grant</button>
          {s.error && <span role="alert" className="text-xs text-red-600">{s.error}</span>}
          {s.ok && <span className="text-xs text-green-700">{s.ok}</span>}
        </form>
      )}
    </div>
  );
}
