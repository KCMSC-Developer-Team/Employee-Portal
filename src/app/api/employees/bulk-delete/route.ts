import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function POST(req:Request){
 const s=await currentSession(); if(!s?.user)return NextResponse.json({error:"Unauthorised"},{status:401});
 const actor=s.user as any; if(actor.role!=="DEVELOPER")return NextResponse.json({error:"Only the Developer can remove employees in bulk."},{status:403});
 let body:any;try{body=await req.json()}catch{return NextResponse.json({error:"Invalid request."},{status:400})}
 const ids=Array.isArray(body.ids)?Array.from(new Set(body.ids.filter((x:any)=>typeof x==="string"&&x.length<100))):[];
 if(!ids.length)return NextResponse.json({error:"Select at least one employee."},{status:400});
 try{
  const records=await prisma.employee.findMany({where:{id:{in:ids}},select:{id:true,userId:true,employeeId:true}});
  if(records.some(e=>e.employeeId==="2603"||e.userId===actor.id))return NextResponse.json({error:"Your own Developer account (employee ID 2603) is protected and cannot be bulk-removed."},{status:400});
  const result=await prisma.$transaction(async tx=>{
   const userIds=records.map(e=>e.userId).filter((x):x is string=>!!x);
   await tx.employee.deleteMany({where:{id:{in:records.map(e=>e.id)}}});
   if(userIds.length)await tx.user.deleteMany({where:{id:{in:userIds},role:"EMPLOYEE"}});
   await tx.auditLog.create({data:{actorId:actor.id,action:"BULK_DELETE_EMPLOYEES",entityType:"Employee",metadata:{count:records.length,employeeIds:records.map(e=>e.employeeId)}}});
   return records.length;
  });
  return NextResponse.json({deleted:result});
 }catch{return NextResponse.json({error:"Could not remove selected employees."},{status:500})}
}
