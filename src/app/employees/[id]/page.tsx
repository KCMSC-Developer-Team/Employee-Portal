import { prisma } from "@/lib/prisma";
import { requireUser, STAFF_ROLES } from "@/lib/auth";
import { Shell, PageHeading } from "@/components/ui";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

export default async function EmployeeDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireUser();
  const role = session.user?.role ?? "EMPLOYEE";
  const email = session.user?.email ?? "";

  if (!STAFF_ROLES.includes(role)) {
    redirect("/employees");
  }

  const { id } = await params;

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          email: true,
        },
      },
      observations:
        role === "COMPUTER_OPERATOR"
          ? false
          : {
              orderBy: {
                createdAt: "desc",
              },
            },
    },
  });

  if (!employee) {
    notFound();
  }

  const observations =
    role === "COMPUTER_OPERATOR" ? [] : employee.observations;

  const fields: [string, string | Date | null | undefined][] = [
    ["Full name (English)", employee.fullNameEnglish],
    ["Full name (Bangla)", employee.fullNameBangla],
    ["Employee ID", employee.employeeId],
    ["Designation", employee.designation],
    ["Position", employee.position],
    ["Subject/Admin Dept.", employee.department],
    ["Supervisor", employee.supervisor],
    ["Date of joining", employee.dateOfJoining],
    ["Father's name", employee.fatherName],
    ["Mother's name", employee.motherName],
    ["Date of birth", employee.dateOfBirth],
    ["Gender", employee.gender],
    ["Blood group", employee.bloodGroup],
    ["Religion", employee.religion],
    ["Marital status", employee.maritalStatus],
    ["Permanent address", employee.permanentAddress],
    ["Present address", employee.presentAddress],
    ["NID/Passport No.", employee.nidPassport],
    ["Home district", employee.homeDistrict],
    ["Mobile number", employee.mobile],
    ["Email", employee.personalEmail || employee.user?.email],
  ];

  function formatValue(value: string | Date | null | undefined) {
    if (value == null || value === "") {
      return "Not provided";
    }

    if (value instanceof Date) {
      return value.toLocaleDateString();
    }

    return value;
  }

  const educationSections: [string, unknown][] = [
    ["Secondary", employee.secondary],
    ["Higher Secondary", employee.higherSecondary],
    ["Graduation", employee.graduation],
    ["Master's", employee.masters],
    ["BEd", employee.bed],
    ["MEd", employee.med],
    ["NTRCA", employee.ntrca],
    ["Other Degree/Training", employee.otherTraining],
    ["Job Experiences", employee.jobExperiences],
  ];

  return (
    <Shell role={role} email={email}>
      <PageHeading
        eyebrow="Employee record"
        title={employee.fullNameEnglish}
        description={`${employee.designation || "Employee"} · ${
          employee.employeeId || "No employee ID"
        }`}
        action={
          <>
            <Link
              href={`/employees/${employee.id}/edit`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
            >
              Edit profile
            </Link>

            {role !== "COMPUTER_OPERATOR" && (
              <Link
                href={`/employees/${employee.id}/observation`}
                className="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white"
              >
                Add observation
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.4fr_.6fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-semibold">Profile information</h2>

          <div className="grid gap-x-8 sm:grid-cols-2">
            {fields.map(([label, value]) => (
              <div key={label} className="border-b border-slate-100 py-3">
                <div className="text-xs text-slate-400">{label}</div>
                <div className="mt-1 break-words text-sm font-medium">
                  {formatValue(value)}
                </div>
              </div>
            ))}
          </div>

          <details className="mt-6 rounded-xl bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Education and experience
            </summary>

            <div className="mt-4 space-y-4 text-xs">
              {educationSections.map(([label, value]) => (
                <div key={label}>
                  <div className="font-semibold">{label}</div>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-slate-500">
                    {value == null
                      ? "Not provided"
                      : typeof value === "string"
                        ? value
                        : JSON.stringify(value, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </details>
        </section>

        {role !== "COMPUTER_OPERATOR" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">Observations</h2>
            <p className="mt-1 text-xs text-slate-500">
              Restricted information
            </p>

            <div className="mt-4 space-y-3">
              {observations.map((observation) => (
                <div
                  key={observation.id}
                  className="rounded-xl bg-slate-50 p-4"
                >
                  <div className="text-sm font-semibold">
                    {observation.subject}
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {observation.createdAt.toLocaleDateString()}
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {observation.description}
                  </p>
                </div>
              ))}

              {observations.length === 0 && (
                <p className="py-4 text-sm text-slate-500">
                  No observations recorded.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </Shell>
  );
}
