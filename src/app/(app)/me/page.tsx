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
      <ProfileView p={profile} />
      <p className="mt-4 text-xs text-slate-500">
        This is your approved official record. Requesting changes (including a photograph) arrives in Stage 4.
      </p>
    </>
  );
}
