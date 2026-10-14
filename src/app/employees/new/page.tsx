import { requireUser, STAFF_ROLES } from "@/lib/auth";
import { Shell, PageHeading } from "@/components/ui";
import { redirect } from "next/navigation";
import { EmployeeForm } from "@/components/employee-form";
export default async function NewEmployee(){const s=await requireUser();if(!STAFF_ROLES.includes(s.user?.role||""))redirect("/dashboard");return <Shell role={s.user?.role||""} email={s.user?.email||""}><PageHeading eyebrow="employees records" title="Create employee" description="Only authorised employees can create employee accounts. Employees cannot self-register."/><EmployeeForm mode="create"/></Shell>}
