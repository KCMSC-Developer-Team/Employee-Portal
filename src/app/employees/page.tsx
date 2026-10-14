import { requireUser } from "@/lib/auth";
import { Shell, PageHeading } from "@/components/ui";
import { EmployeeDirectory } from "@/components/employee-directory";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const session = await requireUser();
  const role = session.user?.role ?? "EMPLOYEE";
  const params = await searchParams;
  const initialSort = [
    "fullNameEnglish",
    "designation",
    "department",
    "employeeId",
    "createdAt",
  ].includes(params.sort || "")
    ? params.sort!
    : "fullNameEnglish";
  const parsedPage = Number.parseInt(params.page ?? "0", 10);
  const initialPage =
    Number.isSafeInteger(parsedPage) && parsedPage >= 0
      ? Math.min(parsedPage, 10000)
      : 0;
  const isStaff = ["DEVELOPER", "AUTHORITY", "COMPUTER_OPERATOR"].includes(role);

  return (
    <Shell role={role} email={session.user?.email ?? ""}>
      <PageHeading
        eyebrow="People directory"
        title={isStaff ? "Employee directory" : "Colleague directory"}
        description={
          isStaff
            ? "Search, sort, review and print employee records. Sensitive observations are not included in this directory."
            : "Colleagues' contact details are available here. Full profiles and observations remain private."
        }
      />
      <EmployeeDirectory
        role={role}
        ownUserId={(session.user as { id?: string }).id ?? ""}
        initialQuery={params.q ?? ""}
        initialSort={initialSort}
        initialPage={initialPage}
      />
    </Shell>
  );
}
