import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentSession, STAFF_ROLES } from "@/lib/auth";
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const s=await currentSession();if(!s?.user)return NextResponse.json({error:"Unauthorised"},{status:401});const role=(s.user as any).role;const actorId=(s.user as any).id;if(!STAFF_ROLES.includes(role))return NextResponse.json({error:"Only employees can review requests."},{status:403});
 const {id}=await params;const {action,note}=await req.json();if(!["approve","reject"].includes(action))return NextResponse.json({error:"Invalid action."},{status:400});
 const request=await prisma.changeRequest.findUnique({where:{id}});if(!request||request.status!=="PENDING")return NextResponse.json({error:"Request is no longer pending."},{status:409});
 await prisma.$transaction(async tx=>{if(action==="approve")await tx.employee.update({where:{id:request.employeeId},data:request.payload as any});await tx.changeRequest.update({where:{id},data:{status:action==="approve"?"APPROVED":"REJECTED",reviewedById:actorId,reviewerNote:String(note||""),reviewedAt:new Date()}});await tx.auditLog.create({data:{actorId,action:action==="approve"?"APPROVE_CHANGE_REQUEST":"REJECT_CHANGE_REQUEST",entityType:"ChangeRequest",entityId:id,metadata:{note:String(note||"")}}});});
 return NextResponse.json({message:action==="approve"?"Changes approved and applied.":"Request rejected."});
}
