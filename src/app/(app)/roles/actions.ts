"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/authz";
import { requestContext } from "@/server/auth/context";
import { grantRole, revokeRole } from "@/server/roles/service";

export interface RoleState { error?: string; ok?: string }

const id = z.string().min(1).max(40);

export async function grantRoleAction(_p: RoleState, fd: FormData): Promise<RoleState> {
  const actor = await requireUser();
  const p = z.object({ userId: id, roleId: id, departmentId: z.string().max(40).optional() })
    .safeParse({ userId: fd.get("userId"), roleId: fd.get("roleId"), departmentId: fd.get("departmentId") || undefined });
  if (!p.success) return { error: "Choose a role." };
  const r = await grantRole(actor, p.data.userId, p.data.roleId, p.data.departmentId ?? null, (await requestContext()).ip);
  if (!r.ok) return { error: r.error };
  revalidatePath("/roles");
  return { ok: "Role granted." };
}

export async function revokeRoleAction(_p: RoleState, fd: FormData): Promise<RoleState> {
  const actor = await requireUser();
  const p = id.safeParse(fd.get("userRoleId"));
  if (!p.success) return { error: "Invalid assignment." };
  const r = await revokeRole(actor, p.data, (await requestContext()).ip);
  if (!r.ok) return { error: r.error };
  revalidatePath("/roles");
  return { ok: "Role revoked." };
}
