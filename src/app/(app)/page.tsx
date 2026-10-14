import { redirect } from "next/navigation";
import { requireUser } from "@/server/authz";
import { scopeFor } from "@/server/authz/policy";

export default async function Home() {
  const user = await requireUser();
  const dash = scopeFor(user, "dashboard:read");
  if (dash === "ALL" || dash.length > 0) redirect("/dashboard");
  const scope = scopeFor(user, "staff:read");
  if (scope === "ALL" || scope.length > 0) redirect("/staff");
  if (user.staffMemberId) redirect("/me");
  return <p className="text-sm text-slate-600">This account has no staff profile and no assigned permissions.</p>;
}
