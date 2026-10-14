import { prisma } from "@/lib/prisma";
import { requireUser, STAFF_ROLES } from "@/lib/auth";
import { Shell, PageHeading } from "@/components/ui";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ObservationPanel } from "@/components/observation-panel";

const educationSections = [
  {
    key: "secondary",
    title: "Secondary",
    fields: [
      ["institution", "Institution"],
      ["location", "Location (District)"],
      ["boardUniversity", "Board/University"],
      ["yearOfPassing", "Year of passing"],
      ["group", "Group"],
      ["result", "Result"],
    ],
  },
  {
    key: "higherSecondary",
    title: "Higher Secondary",
    fields: [
      ["institution", "Institution"],
      ["location", "Location (District)"],
      ["boardUniversity", "Board/University"],
      ["yearOfPassing", "Year of passing"],
      ["group", "Group"],
      ["result", "Result"],
    ],
  },
  {
    key: "graduation",
    title: "Graduation",
    fields: [
      ["institutionUniversity", "Institution/University"],
      ["privatePublic", "Private/Public"],
      ["subject", "Subject"],
      ["degreeAttained", "Degree attained"],
      ["yearOfPassing", "Year of passing"],
      ["result", "Result"],
    ],
  },
  {
    key: "masters",
    title: "Master's",
    fields: [
      ["institutionUniversity", "Institution/University"],
      ["privatePublic", "Private/Public"],
      ["subject", "Subject"],
      ["degreeAttained", "Degree attained"],
      ["yearOfPassing", "Year of passing"],
      ["result", "Result"],
    ],
  },
  {
    key: "bed",
    title: "BEd",
    fields: [
      ["institutionUniversity", "Institution/University"],
      ["privatePublic", "Private/Public"],
      ["yearOfPassing", "Year of passing"],
      ["result", "Result"],
    ],
  },
  {
    key: "med",
    title: "MEd",
    fields: [
      ["institutionUniversity", "Institution/University"],
      ["privatePublic", "Private/Public"],
      ["yearOfPassing", "Year of passing"],
      ["result", "Result"],
    ],
  },
  {
    key: "ntrca",
    title: "NTRCA",
    fields: [
      ["subject", "Subject"],
      ["schoolCollege", "School/College"],
      ["yearOfPassing", "Year of passing"],
      ["result", "Result"],
    ],
  },
  {
    key: "otherTraining",
    title: "Other Degree/Training",
    fields: [
      ["institutionUniversity", "Institution/University"],
      ["description", "Description"],
      ["yearOfPassing", "Year of passing"],
      ["result", "Result"],
    ],
  },
] as const;

function formatValue(value: unknown) {
  if (value == null || value === "") return "Not provided";
  if (value instanceof Date) {
    return value.toLocaleDateString("en-GB", { timeZone: "UTC" });
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-GB", { timeZone: "UTC" });
    }
  }
  return String(value);
}

function ProfileGrid({ items }: { items: [string, unknown][] }) {
  return (
    <dl className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 border-b border-slate-100 py-3">
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-slate-800">
            {formatValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default async function EmployeeDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireUser();
  const role = session.user?.role ?? "EMPLOYEE";
  if (!STAFF_ROLES.includes(role)) redirect("/employees");

  const { id } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id },
  });
  if (!employee) notFound();
  const observations =
    role === "COMPUTER_OPERATOR"
      ? []
      : await prisma.observation.findMany({
          where: { employeeId: employee.id },
          orderBy: [{ observationDate: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            subject: true,
            description: true,
            observationDate: true,
          },
        });

  const employment: [string, unknown][] = [
    ["Full Name (In English)", employee.fullNameEnglish],
    ["Full Name (In Bangla)", employee.fullNameBangla],
    ["Designation", employee.designation],
    ["ID No.", employee.employeeId],
    ["Date of joining", employee.dateOfJoining],
    ["Position", employee.position],
    ["Subject/Admin Dept.", employee.department],
    ["Supervisor", employee.supervisor],
  ];
  const personal: [string, unknown][] = [
    ["Father's Name", employee.fatherName],
    ["Mother's Name", employee.motherName],
    ["Date of Birth", employee.dateOfBirth],
    ["Gender", employee.gender],
    ["Blood Group", employee.bloodGroup],
    ["Religion", employee.religion],
    ["Marital Status", employee.maritalStatus],
    ["Permanent Address", employee.permanentAddress],
    ["Present Address", employee.presentAddress],
    ["NID/Passport No.", employee.nidPassport],
    ["Home District", employee.homeDistrict],
    ["Mobile Number", employee.mobile],
    ["E-mail", employee.personalEmail],
  ];
  const experiences = Array.isArray(employee.jobExperiences)
    ? employee.jobExperiences.slice(0, 3)
    : [];

  return (
    <Shell role={role} email={session.user?.email ?? ""}>
      <PageHeading
        eyebrow="Employee profile"
        title="Employee profile"
        description="Profile and Performance Sheet"
        action={
          <Link
            href={`/employees/${employee.id}/edit`}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
          >
            Edit profile
          </Link>
        }
      />

      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-5 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
            {employee.photoUrl ? (
              <img
                src={employee.photoUrl}
                alt={`${employee.fullNameEnglish || "Employee"} profile`}
                className="h-24 w-24 rounded-2xl object-cover"
              />
            ) : (
              <div
                aria-label="Employee photo not provided"
                className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-slate-100 text-xs text-slate-500"
              >
                No photo
              </div>
            )}
          </div>
          <h2 className="mb-2 font-semibold">Employment information</h2>
          <ProfileGrid items={employment} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="mb-3 font-semibold">Educational background</h2>
          <div className="space-y-5">
            {educationSections.map((section) => {
              const raw = employee[section.key];
              const data =
                raw && typeof raw === "object" && !Array.isArray(raw)
                  ? (raw as Record<string, unknown>)
                  : {};
              return (
                <section key={section.key} className="border-b border-slate-100 pb-4 last:border-0">
                  <h3 className="mb-1 text-sm font-semibold">{section.title}</h3>
                  <ProfileGrid
                    items={section.fields.map(
                      ([key, label]) => [label, data[key]] as [string, unknown],
                    )}
                  />
                </section>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="mb-3 font-semibold">Job experiences</h2>
          <div className="space-y-4">
            {experiences.map((experience, index) => {
              const data =
                experience && typeof experience === "object"
                  ? (experience as Record<string, unknown>)
                  : {};
              return (
                <section key={index} className="rounded-xl border border-slate-100 p-4">
                  <h3 className="mb-1 text-sm font-semibold">Experience {index + 1}</h3>
                  <ProfileGrid
                    items={[
                      ["Institute/Organization", data.instituteOrganization],
                      ["Designation", data.designation],
                      ["From", data.from],
                      ["To", data.to],
                    ]}
                  />
                </section>
              );
            })}
            {!experiences.length && (
              <p className="text-sm text-slate-500">Not provided</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="mb-2 font-semibold">Personal information</h2>
          <ProfileGrid items={personal} />
        </section>

        {role !== "COMPUTER_OPERATOR" && (
          <div id="observations">
            <ObservationPanel
              employeeId={employee.id}
              canAdd={role === "DEVELOPER" || role === "AUTHORITY"}
              initialObservations={observations}
            />
          </div>
        )}
      </div>
    </Shell>
  );
}
