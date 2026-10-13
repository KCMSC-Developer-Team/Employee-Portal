import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeDiff } from "@/components/ChangeDiff";
import { requireUser } from "@/server/authz";
import { getRequestForReview } from "@/server/requests/service";
import { ReviewPanel } from "../review-panel";

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const r = await getRequestForReview(user, id); // null when missing or out of scope
  if (!r) notFound();
  const own = user.staffMemberId === r.staffMemberId;
  return (
    <div className="space-y-4">
      <Link href="/requests" className="text-sm underline">← All requests</Link>
      <h1 className="text-xl font-semibold">Request from {r.staffMember.name} <span className="text-sm font-normal text-slate-500">(ID {r.staffMember.staffId})</span></h1>
      <p className="text-sm text-slate-600">
        Status: <b>{r.status.toLowerCase()}</b> · submitted {r.createdAt.toISOString().slice(0, 10)}
        {r.reviewedBy?.staffMember ? ` · decided by ${r.reviewedBy.staffMember.name}` : ""}
      </p>
      {r.note && <p className="rounded bg-slate-100 p-2 text-sm">Employee note: {r.note}</p>}
      {r.rejectionReason && <p className="rounded bg-red-50 p-2 text-sm text-red-800">Rejection reason: {r.rejectionReason}</p>}
      <section className="rounded-lg border border-slate-200 bg-white p-4"><ChangeDiff items={r.items} /></section>
      {r.status === "PENDING" && (own
        ? <p className="text-sm text-amber-700">You cannot review your own request; another reviewer must decide it.</p>
        : <ReviewPanel id={r.id} />)}
    </div>
  );
}
