import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeDiff } from "@/components/ChangeDiff";
import { requireUser } from "@/server/authz";
import { listOwnRequests } from "@/server/requests/service";
import { CancelButton } from "./cancel-button";

const BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800", APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800", CANCELLED: "bg-slate-100 text-slate-600",
};

export default async function MyRequests() {
  const user = await requireUser();
  if (!user.staffMemberId) notFound();
  const requests = await listOwnRequests(user);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My requests</h1>
        <Link href="/me/edit" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">New request</Link>
      </div>
      {requests.length === 0 && <p className="text-sm text-slate-500">You haven’t submitted any requests.</p>}
      {requests.map((r) => (
        <section key={r.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3 text-sm">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE[r.status]}`}>{r.status.toLowerCase()}</span>
            <span className="text-slate-500">Submitted {r.createdAt.toISOString().slice(0, 10)}</span>
            {r.reviewedAt && <span className="text-slate-500">· decided {r.reviewedAt.toISOString().slice(0, 10)}</span>}
            {r.status === "PENDING" && <span className="ml-auto"><CancelButton id={r.id} /></span>}
          </div>
          {r.status === "REJECTED" && r.rejectionReason && (
            <p className="rounded bg-red-50 p-2 text-sm text-red-800">Reason: {r.rejectionReason}</p>
          )}
          <ChangeDiff items={r.items} />
        </section>
      ))}
    </div>
  );
}
