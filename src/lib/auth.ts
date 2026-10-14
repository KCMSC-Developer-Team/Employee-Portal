import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { redirect } from "next/navigation";

export async function currentSession() {
  return getServerSession(authOptions);
}
export async function requireUser() {
  const session = await currentSession();
  if (!session?.user) redirect("/login");
  return session;
}
export function hasRole(role: string | undefined, allowed: string[]) {
  return !!role && allowed.includes(role);
}
export const STAFF_ROLES = ["DEVELOPER", "AUTHORITY", "COMPUTER_OPERATOR"];
export const APPROVER_ROLES = STAFF_ROLES;
