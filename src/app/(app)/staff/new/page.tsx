import { StaffForm } from "@/components/StaffForm";
import { requirePermission } from "@/server/authz";
import { can } from "@/server/authz/policy";
import { listReferenceData } from "@/server/staff/reference";
import { createStaffAction } from "../actions";

export default async function NewStaff() {
  // Institution-wide create right is required to open the form; the service re-checks per department.
  const user = await requirePermission("staff:create");
  const refs = await listReferenceData();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Add staff</h1>
      {refs.designations.length === 0 && (
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          No designations/departments/categories exist yet — add them under Reference data first.
        </p>
      )}
      <StaffForm mode="create" action={createStaffAction} defaults={{}} refs={refs} canCreateAccount={can(user, "account:manage")} />
    </div>
  );
}
