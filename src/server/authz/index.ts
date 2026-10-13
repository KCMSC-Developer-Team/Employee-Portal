import { notFound, redirect } from "next/navigation";
import type { PermissionKey } from "@/lib/permissions";
import { getCurrentUser } from "./current-user";
import { can, type AuthUser, type Scope } from "./policy";

export * from "./policy";
export { getCurrentUser };

/** Every page/action/route starts here. Unauthenticated → /login; temp-password accounts → /change-password. */
export async function requireUser(opts?: { allowPasswordChange?: boolean }): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts?.allowPasswordChange) redirect("/change-password");
  return user;
}

/** Denies with 404 (not 403) so the existence of admin/leader features isn't disclosed. */
export async function requirePermission(permission: PermissionKey, scope?: Scope): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user, permission, scope)) notFound();
  return user;
}
