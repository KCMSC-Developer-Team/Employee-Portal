import { notFound } from "next/navigation";
import { StaffForm } from "@/components/StaffForm";
import { requireUser } from "@/server/authz";
import { profileToDefaults } from "@/lib/staff-form-defaults";
import { getOwnProfile } from "@/server/staff/queries";
import { submitRequestAction } from "./actions";

export default async function RequestChange() {
  const user = await requireUser();
  const p = await getOwnProfile(user); // own record from the session only
  if (!p) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Request a change to your profile</h1>
      <p className="text-sm text-slate-600">
        Designation, department, joining date and employment status are managed by administration and can’t be requested here.
      </p>
      <StaffForm mode="request" action={submitRequestAction} defaults={profileToDefaults(p)}
        refs={{ departments: [], designations: [], categories: [] }} />
    </div>
  );
}
