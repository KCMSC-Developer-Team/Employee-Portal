import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentSession, STAFF_ROLES } from "@/lib/auth";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const editable = ["fullNameEnglish","fullNameBangla","employeeId","designation","position","department","supervisor","mobile","personalEmail","fatherName","motherName","gender","bloodGroup","religion","maritalStatus","homeDistrict","nidPassport","permanentAddress","presentAddress"];
export async function POST(req:Request){
 const session=await currentSession();if(!session?.user)return NextResponse.json({error:"Unauthorised"},{status:401});
 const body=await req.json();const role=(session.user as any).role;const id=(session.user as any).id;
 const fields=Object.fromEntries(editable.map(k=>[k,String(body.fields?.[k]??"").trim()||null]));
 if(body.mode==="create"){
  if(!STAFF_ROLES.includes(role))return NextResponse.json({error:"Only authorised staff can create employees."},{status:403});
  if(!body.email||!body.password||body.password.length<10)return NextResponse.json({error:"A login email and password of at least 10 characters are required."},{status:400});
  try { const hash=await bcrypt.hash(body.password,12);const user=await prisma.user.create({data:{email:String(body.email).toLowerCase(),passwordHash:hash,role:Role.EMPLOYEE,createdById:id,employee:{create:fields as any}}});await prisma.auditLog.create({data:{actorId:id,action:"CREATE_EMPLOYEE",entityType:"Employee",entityId:user.employee?.id}});return NextResponse.json({message:"Employee account created.",redirect:"/employees"}); } catch { return NextResponse.json({error:"Could not create account. Check duplicate email or employee ID."},{status:400}); }
 }
 if(body.mode==="edit"){
  if(!STAFF_ROLES.includes(role))return NextResponse.json({error:"Forbidden"},{status:403});
  try{const updated=await prisma.employee.update({where:{id:body.employeeId},data:fields as any});await prisma.auditLog.create({data:{actorId:id,action:"EDIT_EMPLOYEE",entityType:"Employee",entityId:updated.id}});return NextResponse.json({message:"Profile updated.",redirect:`/employees/${updated.id}`});}catch{return NextResponse.json({error:"Unable to update this record. Check duplicate employee ID."},{status:400});}
 }
 if(body.mode==="request"){
  const employee=await prisma.employee.findUnique({where:{userId:id}});if(!employee||employee.id!==body.employeeId)return NextResponse.json({error:"You may edit only your own profile."},{status:403});
  const request=await prisma.changeRequest.create({data:{employeeId:employee.id,submittedById:id,payload:fields as any}});await prisma.auditLog.create({data:{actorId:id,action:"SUBMIT_PROFILE_CHANGE",entityType:"ChangeRequest",entityId:request.id}});return NextResponse.json({message:"Update request submitted for approval.",redirect:"/my-profile"});
 }
 return NextResponse.json({error:"Unsupported operation."},{status:400});
}
