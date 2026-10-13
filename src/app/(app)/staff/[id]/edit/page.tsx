import { notFound } from "next/navigation";
import { StaffForm } from "@/components/StaffForm";
import { requireUser } from "@/server/authz";
import { can } from "@/server/authz/policy";
import { profileToDefaults } from "@/lib/staff-form-defaults";
import { getStaffProfileForAdmin } from "@/server/staff/queries";
import { listReferenceData } from "@/server/staff/reference";
import { updateStaffAction } from "../../actions";

export default async function EditStaff({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = await getStaffProfileForAdmin(user, id);
  if (!p || !can(user, "staff:update", { departmentId: p.departmentId })) notFound();
  const refs = await listReferenceData();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Edit {p.name}</h1>
      <p className="text-xs text-slate-500">Employment status (e.g. resignation) is changed separately — Stage 4. Observation is not editable here.</p>
      <StaffForm mode="edit" action={updateStaffAction} defaults={profileToDefaults(p)} refs={refs} recordId={p.id} version={p.version} />
    </div>
  );
}
