"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/authz";
import { logout } from "@/server/auth/login";
import { requestContext } from "@/server/auth/context";

export async function logoutAction() {
  await logout(await getCurrentUser(), await requestContext());
  redirect("/login");
}
