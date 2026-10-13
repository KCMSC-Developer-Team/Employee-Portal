import { redirect } from "next/navigation";
import { requireUser } from "@/server/authz";
import { scopeFor } from "@/server/authz/policy";

export default async function Home() {
  const user = await requireUser();
  const scope = scopeFor(user, "staff:read");
  if (scope === "ALL" || scope.length > 0) redirect("/staff"); // becomes /dashboard in Stage 6
  if (user.staffMemberId) redirect("/me");
  return <p className="text-sm text-slate-600">This account has no staff profile and no assigned permissions.</p>;
}
