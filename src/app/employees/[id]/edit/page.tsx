import { prisma } from "@/lib/prisma";
import { requireUser, STAFF_ROLES } from "@/lib/auth";
import { Shell, PageHeading } from "@/components/ui";
import { EmployeeForm } from "@/components/employee-form";
import { notFound, redirect } from "next/navigation";
export default async function EditEmployee({params}:{params:Promise<{id:string}>}){const s=await requireUser();if(!STAFF_ROLES.includes(s.user?.role||""))redirect("/dashboard");const {id}=await params;const e=await prisma.employee.findUnique({where:{id}});if(!e)notFound();const initial=Object.fromEntries(["fullNameEnglish","fullNameBangla","employeeId","designation","position","department","supervisor","mobile","personalEmail","fatherName","motherName","gender","bloodGroup","religion","maritalStatus","homeDistrict","nidPassport","permanentAddress","presentAddress"].map(k=>[k,(e as any)[k]||""]));return <Shell role={s.user?.role||""} email={s.user?.email||""}><PageHeading eyebrow="employees records" title="Edit employee profile" description="Authorised employees edits apply directly. Employee edits must be submitted for approval."/><EmployeeForm mode="edit" initial={{...initial,id:e.id}}/></Shell>}
