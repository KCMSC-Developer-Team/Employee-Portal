import { requireUser, STAFF_ROLES } from "@/lib/auth";
import { Shell, PageHeading } from "@/components/ui";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ObservationForm } from "@/components/observation-form";
export default async function AddObservation({params}:{params:Promise<{id:string}>}){const s=await requireUser();if(!["DEVELOPER","AUTHORITY"].includes(s.user?.role||""))redirect("/employees");const {id}=await params;const e=await prisma.employee.findUnique({where:{id},select:{id:true,fullNameEnglish:true}});if(!e)notFound();return <Shell role={s.user?.role||""} email={s.user?.email||""}><PageHeading eyebrow="Restricted record" title="Add observation" description={`This note will be visible to ${e.fullNameEnglish} and authorised Authority/Developer users only.`}/><ObservationForm employeeId={id}/></Shell>}
