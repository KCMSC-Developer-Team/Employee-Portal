import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/ProfileView";
import { requireUser } from "@/server/authz";
import { can } from "@/server/authz/policy";
import { getStaffProfileForAdmin } from "@/server/staff/queries";

export default async function StaffDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = await getStaffProfileForAdmin(user, id); // null if missing OR outside scope → same 404
  if (!p) notFound();
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <Link href="/staff" className="underline">← All staff</Link>
        {can(user, "staff:update", { departmentId: p.departmentId }) && <Link href={`/staff/${p.id}/edit`} className="underline">Edit</Link>}
      </div>
      <ProfileView p={p} />
    </div>
  );
}
