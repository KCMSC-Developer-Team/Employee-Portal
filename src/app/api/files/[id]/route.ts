import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/authz";
import { can } from "@/server/authz/policy";
import { readStoredFile } from "@/server/files/storage";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

/**
 * Authenticated file streaming. Allowed: the photo's owner, or staff with staff:read / request:review
 * covering the owner's department. There is no public URL or directory listing for any file.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.mustChangePassword) return new Response("Forbidden", { status: 403 });

  const { id } = await ctx.params;
  const asset = await db.fileAsset.findUnique({
    where: { id },
    select: { purpose: true, storageKey: true, mimeType: true, ownerStaffId: true, ownerStaff: { select: { departmentId: true } } },
  });
  if (!asset || asset.purpose !== "PROFILE_PHOTO" || !asset.ownerStaffId) return notFound();

  const dept = { departmentId: asset.ownerStaff?.departmentId ?? null };
  const allowed =
    user.staffMemberId === asset.ownerStaffId || can(user, "staff:read", dept) || can(user, "request:review", dept);
  if (!allowed) return notFound(); // same response as "missing": no existence disclosure

  let body: Buffer;
  try {
    body = await readStoredFile(asset.storageKey);
  } catch {
    return notFound();
  }
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
