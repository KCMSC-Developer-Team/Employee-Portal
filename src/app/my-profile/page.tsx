import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { Shell, PageHeading } from "@/components/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ObservationPanel } from "@/components/observation-panel";

const educationSections = [
  ["Secondary", "secondary", [
    ["institution", "Institution"],
    ["location", "Location (District)"],
    ["boardUniversity", "Board/University"],
    ["yearOfPassing", "Year of passing"],
    ["group", "Group"],
    ["result", "Result"],
  ]],
  ["Higher Secondary", "higherSecondary", [
    ["institution", "Institution"],
    ["location", "Location (District)"],
    ["boardUniversity", "Board/University"],
    ["yearOfPassing", "Year of passing"],
    ["group", "Group"],
    ["result", "Result"],
  ]],
  ["Graduation", "graduation", [
    ["institutionUniversity", "Institution/University"],
    ["privatePublic", "Private/Public"],
    ["subject", "Subject"],
    ["degreeAttained", "Degree attained"],
    ["yearOfPassing", "Year of passing"],
    ["result", "Result"],
  ]],
  ["Master's", "masters", [
    ["institutionUniversity", "Institution/University"],
    ["privatePublic", "Private/Public"],
    ["subject", "Subject"],
    ["degreeAttained", "Degree attained"],
    ["yearOfPassing", "Year of passing"],
    ["result", "Result"],
  ]],
  ["BEd", "bed", [
    ["institutionUniversity", "Institution/University"],
    ["privatePublic", "Private/Public"],
    ["yearOfPassing", "Year of passing"],
    ["result", "Result"],
  ]],
  ["MEd", "med", [
    ["institutionUniversity", "Institution/University"],
    ["privatePublic", "Private/Public"],
    ["yearOfPassing", "Year of passing"],
    ["result", "Result"],
  ]],
  ["NTRCA", "ntrca", [
    ["subject", "Subject"],
    ["schoolCollege", "School/College"],
    ["yearOfPassing", "Year of passing"],
    ["result", "Result"],
  ]],
  ["Other Degree/Training", "otherTraining", [
    ["institutionUniversity", "Institution/University"],
    ["description", "Description"],
    ["yearOfPassing", "Year of passing"],
    ["result", "Result"],
  ]],
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

function DataGrid({ items }: { items: [string, unknown][] }) {
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

export default async function MyProfile() {
  const session = await requireUser();
  const role = session.user?.role ?? "EMPLOYEE";
  const employee = await prisma.employee.findUnique({
    where: { userId: (session.user as { id?: string }).id },
    include: {
      observations:
        role === "COMPUTER_OPERATOR"
          ? false
          : {
              orderBy: [{ observationDate: "desc" }, { createdAt: "desc" }],
              select: {
                id: true,
                subject: true,
                description: true,
                observationDate: true,
              },
            },
    },
  });
  if (!employee) notFound();

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
        eyebrow="Personal record"
        title="My profile"
        description="Profile and Performance Sheet"
        action={
          <Link
            href="/my-profile/edit"
            className="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white"
          >
            Request profile update
          </Link>
        }
      />
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-4 border-b border-slate-100 pb-5">
            {employee.photoUrl ? (
              <img
                src={employee.photoUrl}
                alt="Employee profile"
                className="h-24 w-24 rounded-2xl object-cover"
              />
            ) : (
              <div className="grid h-24 w-24 place-items-center rounded-2xl bg-slate-100 text-xs text-slate-500">
                No photo
              </div>
            )}
          </div>
          <h2 className="mb-2 font-semibold">Employment information</h2>
          <DataGrid items={employment} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="mb-3 font-semibold">Educational background</h2>
          <div className="space-y-5">
            {educationSections.map(([title, key, fields]) => {
              const raw = employee[key];
              const data =
                raw && typeof raw === "object" && !Array.isArray(raw)
                  ? (raw as Record<string, unknown>)
                  : {};
              return (
                <section key={key} className="border-b border-slate-100 pb-4 last:border-0">
                  <h3 className="mb-1 text-sm font-semibold">{title}</h3>
                  <DataGrid
                    items={fields.map(
                      ([name, label]) => [label, data[name]] as [string, unknown],
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
                  <DataGrid
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
            {!experiences.length && <p className="text-sm text-slate-500">Not provided</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="mb-2 font-semibold">Personal information</h2>
          <DataGrid items={personal} />
        </section>

        {role !== "COMPUTER_OPERATOR" && (
          <ObservationPanel
            employeeId={employee.id}
            canAdd={false}
            initialObservations={employee.observations}
          />
        )}
      </div>
    </Shell>
  );
}
