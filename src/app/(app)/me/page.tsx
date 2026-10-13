import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/ProfileView";
import { requireUser } from "@/server/authz";
import { getOwnProfile } from "@/server/staff/queries";

// Employee portal: the profile is resolved from the SESSION, never from a URL parameter.
export default async function MyProfile() {
  const user = await requireUser();
  const profile = await getOwnProfile(user);
  if (!profile) notFound();
  return (
    <>
      <div className="mb-3 flex gap-4 text-sm">
        <Link className="underline" href="/me/edit">Request a change</Link>
        <Link className="underline" href="/me/requests">My requests</Link>
      </div>
      <ProfileView p={profile} />
      <p className="mt-4 text-xs text-slate-500">This is your approved official record. Changes take effect only after an administrator approves them.</p>
    </>
  );
}
