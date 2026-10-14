import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentSession, STAFF_ROLES } from "@/lib/auth";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const scalarEditable = ["fullNameEnglish","fullNameBangla","employeeId","designation","position","department","supervisor","fatherName","motherName","gender","bloodGroup","religion","maritalStatus","permanentAddress","presentAddress","nidPassport","homeDistrict","mobile","personalEmail","photoUrl"];
const jsonEditable = ["secondary","higherSecondary","graduation","masters","bed","med","ntrca","otherTraining","jobExperiences","sheetObservations"];
const dateEditable = ["dateOfJoining","dateOfBirth"];
function cleanFields(source:any){
 const out:any={};
 for(const key of scalarEditable) out[key]=String(source?.[key]??"").trim()||null;
 for(const key of jsonEditable) { if(source?.[key]!==undefined && source?.[key]!==null) out[key]=source[key]; }
 for(const key of dateEditable){const v=String(source?.[key]??"").trim();out[key]=v?new Date(`${v}T00:00:00.000Z`):null;if(out[key]&&Number.isNaN(out[key].getTime()))throw new Error(`Invalid ${key}`);}
 return out;
}
export async function POST(req:Request){
 const session=await currentSession();if(!session?.user)return NextResponse.json({error:"Unauthorised"},{status:401});
 const body=await req.json();const role=(session.user as any).role;const id=(session.user as any).id;
 let fields:any;try{fields=cleanFields(body.fields);}catch{return NextResponse.json({error:"One of the dates is invalid."},{status:400});}
 if(body.mode==="create"){
  if(!STAFF_ROLES.includes(role))return NextResponse.json({error:"Only authorised employees can create employees."},{status:403});
  const employeeId=String(fields.employeeId||"").trim();
  if(!employeeId)return NextResponse.json({error:"Employee ID is required to create the employee login."},{status:400});
  if(!fields.fullNameEnglish)return NextResponse.json({error:"Full name in English is required."},{status:400});
  try{const hash=await bcrypt.hash(employeeId,12);const internalEmail=`employee-${employeeId}@employees.kcmsc.edu.bd`;const user=await prisma.user.create({data:{email:internalEmail,passwordHash:hash,role:Role.EMPLOYEE,createdById:id,employee:{create:{...fields,employeeId} as any}}});await prisma.auditLog.create({data:{actorId:id,action:"CREATE_EMPLOYEE",entityType:"Employee",entityId:user.employee?.id}});return NextResponse.json({message:"Profile and login created. Initial password is the employee ID.",redirect:"/employees"});}catch{return NextResponse.json({error:"Could not create account. Check that the employee ID is unique."},{status:400});}
 }
 if(body.mode==="edit"){
  if(!STAFF_ROLES.includes(role))return NextResponse.json({error:"Forbidden"},{status:403});
  try{const updated=await prisma.employee.update({where:{id:body.employeeId},data:fields as any});await prisma.auditLog.create({data:{actorId:id,action:"EDIT_EMPLOYEE",entityType:"Employee",entityId:updated.id}});return NextResponse.json({message:"Profile updated.",redirect:`/employees/${updated.id}`});}catch{return NextResponse.json({error:"Unable to update this record. Check the employee ID and dates."},{status:400});}
 }
 if(body.mode==="request"){
  const employee=await prisma.employee.findUnique({where:{userId:id}});if(!employee||employee.id!==body.employeeId)return NextResponse.json({error:"You may edit only your own profile."},{status:403});
  const request=await prisma.changeRequest.create({data:{employeeId:employee.id,submittedById:id,payload:fields as any}});await prisma.auditLog.create({data:{actorId:id,action:"SUBMIT_PROFILE_CHANGE",entityType:"ChangeRequest",entityId:request.id}});return NextResponse.json({message:"Update request submitted for approval.",redirect:"/my-profile"});
 }
 return NextResponse.json({error:"Unsupported operation."},{status:400});
}
