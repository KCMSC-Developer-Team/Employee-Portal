import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { Shell, PageHeading } from "@/components/ui";
import { EmployeeForm } from "@/components/employee-form";
import { notFound } from "next/navigation";
export default async function EditMyProfile(){const s=await requireUser();const e=await prisma.employee.findUnique({where:{userId:(s.user as any).id}});if(!e)notFound();const keys=["fullNameEnglish","fullNameBangla","employeeId","designation","position","department","supervisor","mobile","personalEmail","fatherName","motherName","gender","bloodGroup","religion","maritalStatus","homeDistrict","nidPassport","permanentAddress","presentAddress"];const initial=Object.fromEntries(keys.map(k=>[k,(e as any)[k]||""]));return <Shell role={s.user?.role||""} email={s.user?.email||""}><PageHeading eyebrow="Personal record" title="Request profile update" description="Changes are sent to the approval queue. Your official profile stays unchanged until approved."/><EmployeeForm mode="request" initial={{...initial,id:e.id}}/></Shell>}
