import { getCurrentUser } from "@/server/authz";
import { ForbiddenError } from "@/server/authz/policy";
import { issuesCsv } from "@/server/import/service";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  try {
    const csv = await issuesCsv(user, id);
    if (csv === null) return new Response("Not found", { status: 404 });
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="import-issues.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Not found", { status: 404 });
    throw e;
  }
}
