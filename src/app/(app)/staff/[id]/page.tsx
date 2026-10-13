import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/ProfileView";
import { requireUser } from "@/server/authz";
import { can } from "@/server/authz/policy";
import { EMPLOYMENT_STATUS_LABEL, fmtDate } from "@/lib/labels";
import { recordHistory } from "@/server/audit/queries";
import { getStaffProfileForAdmin } from "@/server/staff/queries";
import { listStatusHistory } from "@/server/staff/status";
import { AccountPanel, PhotoPanel, StatusPanel } from "./panels";

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-4">
    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
    {children}
  </section>
);

export default async function StaffDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = await getStaffProfileForAdmin(user, id); // null if missing OR outside scope → same 404
  if (!p) notFound();

  const dept = { departmentId: p.departmentId };
  const canStatus = can(user, "staff:status", dept) && user.staffMemberId !== p.id;
  const canUpdate = can(user, "staff:update", dept);
  const canAccount = can(user, "account:manage"); // institution-wide only
  const [history, audit] = await Promise.all([
    listStatusHistory(p.id),
    can(user, "audit:read") ? recordHistory(user, p.id, p.departmentId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm">
        <Link href="/staff" className="underline">← All staff</Link>
        {canUpdate && <Link href={`/staff/${p.id}/edit`} className="underline">Edit</Link>}
      </div>
      <ProfileView p={p} />

      {canUpdate && <Panel title="Official photograph"><PhotoPanel id={p.id} /></Panel>}

      <Panel title="Employment status">
        <p className="mb-2 text-sm">Current: <b>{EMPLOYMENT_STATUS_LABEL[p.employmentStatus]}</b></p>
        {canStatus && <StatusPanel id={p.id} version={p.version} current={p.employmentStatus} />}
        {history.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {history.map((h) => (
              <li key={h.id}>
                {fmtDate(h.effectiveDate)}: {EMPLOYMENT_STATUS_LABEL[h.fromStatus]} → {EMPLOYMENT_STATUS_LABEL[h.toStatus]}
                {h.reason ? ` — ${h.reason}` : ""} <span className="text-slate-400">({h.recordedBy.staffMember?.name ?? "system"})</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {canAccount && (
        <Panel title="Login account">
          <AccountPanel staffId={p.id} hasAccount={!!p.account} status={p.account?.accountStatus ?? null} />
        </Panel>
      )}

      {audit.length > 0 && (
        <Panel title="Record history">
          <ul className="space-y-1 text-sm text-slate-600">
            {audit.map((a) => (
              <li key={a.id}>
                {a.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {a.action} · {a.actor?.staffMember?.name ?? "system"}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
