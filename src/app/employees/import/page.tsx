import { requireUser, STAFF_ROLES } from "@/lib/auth";
import { Shell, PageHeading } from "@/components/ui";
import { redirect } from "next/navigation";
import { ImportForm } from "@/components/import-form";
export default async function ImportEmployees(){const s=await requireUser();if(!STAFF_ROLES.includes(s.user?.role||""))redirect("/dashboard");return <Shell role={s.user?.role||""} email={s.user?.email||""}><PageHeading eyebrow="Bulk operations" title="Import employees" description="Upload an .xlsx or .csv file, map each spreadsheet column to an employee field, review the preview, then commit. Every imported employee receives a login account automatically."/><ImportForm/></Shell>}
