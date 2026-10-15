import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentSession, STAFF_ROLES } from "@/lib/auth";
import { Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { profileEditableFields } from "@/lib/profile-changes";

const scalarEditable = ["fullNameEnglish","fullNameBangla","employeeId","designation","position","department","supervisor","fatherName","motherName","gender","bloodGroup","religion","maritalStatus","permanentAddress","presentAddress","nidPassport","homeDistrict","mobile","personalEmail","photoUrl"];
const jsonEditable = ["secondary","higherSecondary","graduation","masters","bed","med","ntrca","otherTraining","jobExperiences"];
const dateEditable = ["dateOfJoining","dateOfBirth"];
const directorySorts = ["fullNameEnglish","designation","department","employeeId","createdAt"] as const;

export async function GET(request:Request){
 const session=await currentSession();
 if(!session?.user)return NextResponse.json({error:"Unauthorised"},{status:401});
 const params=new URL(request.url).searchParams;
 const query=(params.get("q")||"").trim();
 if(query.length>120)return NextResponse.json({error:"Search text must be 120 characters or fewer."},{status:400});
 const requestedSort=params.get("sort")||"fullNameEnglish";
 const sort=(directorySorts as readonly string[]).includes(requestedSort)?requestedSort as typeof directorySorts[number]:"fullNameEnglish";
 const parsedPage=Number.parseInt(params.get("page")||"0",10);
 const page=Number.isSafeInteger(parsedPage)&&parsedPage>=0?Math.min(parsedPage,10000):0;
 const orderBy:Prisma.EmployeeOrderByWithRelationInput=sort==="createdAt"?{createdAt:"desc"}:{[sort]:"asc"};
 const rows=await prisma.employee.findMany({
  where:query?{OR:[
   {fullNameEnglish:{contains:query,mode:"insensitive"}},
   {fullNameBangla:{contains:query,mode:"insensitive"}},
   {employeeId:{contains:query,mode:"insensitive"}},
   {designation:{contains:query,mode:"insensitive"}},
   {department:{contains:query,mode:"insensitive"}},
  ]}:{},
  orderBy,
  skip:page*100,
  take:101,
  select:{
   id:true,
   userId:true,
   fullNameEnglish:true,
   fullNameBangla:true,
   employeeId:true,
   designation:true,
   department:true,
   mobile:true,
   personalEmail:true,
   user:{select:{email:true}},
  },
 });
 return NextResponse.json({rows:rows.slice(0,100),hasMore:rows.length>100,page});
}

function cleanFields(source:unknown){
 if(!source||typeof source!=="object"||Array.isArray(source))throw new Error("Invalid fields");
 const input=source as Record<string,unknown>;
 const out:Record<string,unknown>={};
 for(const key of scalarEditable){
  const value=input[key];
  if(value!==undefined&&value!==null&&typeof value!=="string")throw new Error(`Invalid ${key}`);
  out[key]=typeof value==="string"?value.trim()||null:null;
 }
 for(const key of jsonEditable){
  const value=input[key];
  if(value===undefined||value===null||value==="")continue;
  if(key==="jobExperiences"){
   if(!Array.isArray(value)||value.length>3||value.some(experience=>{
    if(!experience||typeof experience!=="object"||Array.isArray(experience))return true;
    const entry=experience as Record<string,unknown>;
    if(Object.values(entry).some(item=>typeof item!=="string"))return true;
    return ["from","to"].some(date=>{
     const item=entry[date];
     return typeof item==="string"&&item!==""&&(!/^\d{4}-\d{2}-\d{2}$/.test(item)||Number.isNaN(Date.parse(`${item}T00:00:00.000Z`))||new Date(`${item}T00:00:00.000Z`).toISOString().slice(0,10)!==item);
    });
   }))throw new Error("Job experiences must contain no more than three entries with valid dates.");
   out[key]=value;
  }else{
   if(typeof value!=="object"||Array.isArray(value))throw new Error(`Invalid ${key}`);
   out[key]=value;
  }
 }
 for(const key of dateEditable){
  const value=input[key];
  if(value===undefined||value===null||value===""){out[key]=null;continue;}
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))||new Date(`${value}T00:00:00.000Z`).toISOString().slice(0,10)!==value)throw new Error(`Invalid ${key}`);
  out[key]=new Date(`${value}T00:00:00.000Z`);
 }
 return out;
}
export async function POST(req:Request){
 const session=await currentSession();if(!session?.user)return NextResponse.json({error:"Unauthorised"},{status:401});
 let body:any;try{body=await req.json();}catch{return NextResponse.json({error:"Invalid request body."},{status:400});}const role=(session.user as any).role;const id=(session.user as any).id;
 let fields:Record<string,unknown>;try{fields=cleanFields(body.fields);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid profile fields."},{status:400});}
 if(body.mode==="create"){
  if(!STAFF_ROLES.includes(role))return NextResponse.json({error:"Only authorised employees can create employees."},{status:403});
  const employeeId=String(fields.employeeId||"").trim();
  if(!employeeId)return NextResponse.json({error:"Employee ID is required to create the employee login."},{status:400});
  if(!fields.fullNameEnglish)return NextResponse.json({error:"Full name in English is required."},{status:400});
  try{const hash=await bcrypt.hash(employeeId,12);const internalEmail=`employee-${employeeId}@employees.kcmsc.edu.bd`;const user=await prisma.user.create({data:{email:internalEmail,passwordHash:hash,role:Role.EMPLOYEE,createdById:id,employee:{create:{...fields,employeeId} as any}},include:{employee:{select:{id:true}}}});await prisma.auditLog.create({data:{actorId:id,action:"CREATE_EMPLOYEE",entityType:"Employee",entityId:user.employee?.id}});return NextResponse.json({message:"Profile and login created. Initial password is the employee ID.",redirect:"/employees"});}catch{return NextResponse.json({error:"Could not create account. Check that the employee ID is unique."},{status:400});}
 }
 if(body.mode==="edit"){
  if(!STAFF_ROLES.includes(role))return NextResponse.json({error:"Forbidden"},{status:403});
  try{const updated=await prisma.employee.update({where:{id:body.employeeId},data:fields as any});await prisma.auditLog.create({data:{actorId:id,action:"EDIT_EMPLOYEE",entityType:"Employee",entityId:updated.id}});return NextResponse.json({message:"Profile updated.",redirect:`/employees/${updated.id}`});}catch{return NextResponse.json({error:"Unable to update this record. Check the employee ID and dates."},{status:400});}
 }
 if(body.mode==="request"){
  const employee=await prisma.employee.findUnique({where:{userId:id}});if(!employee||employee.id!==body.employeeId)return NextResponse.json({error:"You may edit only your own profile."},{status:403});
  const baseline=Object.fromEntries(profileEditableFields.map(key=>{const value=employee[key as keyof typeof employee];return [key,value instanceof Date?value.toISOString():value??null]}));
  const payload={...fields,_baseline:baseline};
  await prisma.$transaction(async tx=>{
   const request=await tx.changeRequest.create({data:{employeeId:employee.id,submittedById:id,payload:payload as any}});
   await tx.auditLog.create({data:{actorId:id,action:"SUBMIT_PROFILE_CHANGE",entityType:"ChangeRequest",entityId:request.id}});
  });
  return NextResponse.json({message:"Update request submitted for approval.",redirect:"/my-profile"});
 }
 return NextResponse.json({error:"Unsupported operation."},{status:400});
}
