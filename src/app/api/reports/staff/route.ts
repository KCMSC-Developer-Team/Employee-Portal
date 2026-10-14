import { getCurrentUser } from "@/server/authz";
import { ForbiddenError } from "@/server/authz/policy";
import { requestContext } from "@/server/auth/context";
import { parseFilters } from "@/server/staff/queries";
import { staffRosterCsv } from "@/server/reports/service";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Not found", { status: 404 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { page: _page, ...f } = parseFilters(sp);
  try {
    const csv = await staffRosterCsv(user, f, (await requestContext()).ip);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="staff-roster.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Not found", { status: 404 });
    throw e;
  }
}
