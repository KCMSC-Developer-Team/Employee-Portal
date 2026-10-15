import { prisma } from "@/lib/prisma";
import { requireUser, STAFF_ROLES } from "@/lib/auth";
import { Shell, PageHeading } from "@/components/ui";
import { redirect } from "next/navigation";
import { RequestActions } from "@/components/request-actions";
import { RequestComparison } from "@/components/request-comparison";
import { buildProfileChanges, profileEditableFields } from "@/lib/profile-changes";

export default async function Requests() {
  const session = await requireUser();
  const role = session.user?.role || "";
  if (!STAFF_ROLES.includes(role)) redirect("/dashboard");

  const rows = await prisma.changeRequest.findMany({
    where: { status: "PENDING" },
    include: { employee: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <Shell role={role} email={session.user?.email || ""}>
      <PageHeading
        eyebrow="Review queue"
        title="Profile change requests"
        description="Compare each employee's current profile with the submitted changes before deciding."
      />
      <div className="space-y-4">
        {rows.map((request) => {
          const current = Object.fromEntries(
            profileEditableFields.map((key) => [
              key,
              request.employee[key as keyof typeof request.employee],
            ]),
          );
          const changes = buildProfileChanges(
            current,
            request.payload,
          );
          return (
            <article
              key={request.id}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-col justify-between gap-3 sm:flex-row">
                <div>
                  <h2 className="font-semibold">
                    {request.employee.fullNameEnglish || "Unnamed employee"}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {request.employee.employeeId || "No ID"} ·{" "}
                    {request.employee.designation || "Employee"} · Submitted{" "}
                    {request.createdAt.toLocaleString()}
                  </p>
                </div>
                <span className="h-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  Pending review
                </span>
              </div>
              <RequestComparison changes={changes} />
              <RequestActions
                requestId={request.id}
                hasChanges={changes.length > 0}
                canReview={request.submittedById !== (session.user as { id?: string }).id}
              />
            </article>
          );
        })}
        {!rows.length && (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <div className="font-semibold">You're all caught up</div>
            <p className="mt-2 text-sm text-slate-500">
              There are no pending profile changes.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}
