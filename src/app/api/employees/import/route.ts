import { NextResponse } from "next/server";
import { currentSession, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
const allowed = ["fullNameEnglish","fullNameBangla","employeeId","designation","dateOfJoining","position","department","supervisor","photoUrl","mobile","personalEmail","fatherName","motherName","dateOfBirth","gender","bloodGroup","religion","maritalStatus","homeDistrict","nidPassport","permanentAddress","presentAddress","secondary","higherSecondary","graduation","masters","bed","med","ntrca","otherTraining","jobExperiences"] as const;
const dateKeys = new Set(["dateOfJoining","dateOfBirth"]);
const jsonKeys = new Set(["secondary","higherSecondary","graduation","masters","bed","med","ntrca","otherTraining","jobExperiences"]);
export async function POST(req:Request){
 const s=await currentSession(); if(!s?.user)return NextResponse.json({error:"Unauthorised"},{status:401});
 if(!STAFF_ROLES.includes((s.user as any).role))return NextResponse.json({error:"Forbidden"},{status:403});
 const form=await req.formData(); const file=form.get("file"); const mappingRaw=form.get("mapping");
 if(!(file instanceof File))return NextResponse.json({error:"Select an Excel or CSV file."},{status:400});
 if(file.size>5*1024*1024)return NextResponse.json({error:"File must be smaller than 5 MB."},{status:400});
 let mapping:Record<string,string>={}; try { mapping=JSON.parse(String(mappingRaw||"{}")); } catch { return NextResponse.json({error:"Column mapping is invalid."},{status:400}); }
 for(const [column,field] of Object.entries(mapping)){if(!column || !(allowed as readonly string[]).includes(field))return NextResponse.json({error:"Column mapping contains an unsupported field."},{status:400});}
 if(!Object.values(mapping).includes("employeeId"))return NextResponse.json({error:"Map a spreadsheet column to Employee ID. Each employee's initial password will be their ID."},{status:400});
 try {
  const workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true}); const sheet=workbook.Sheets[workbook.SheetNames[0]];
  if(!sheet)return NextResponse.json({error:"No worksheet found."},{status:400});
  const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:""}); if(!rows.length)return NextResponse.json({error:"The spreadsheet has no data rows."},{status:400});
  let created=0,skipped=0; const errors:string[]=[];
  for(let index=0;index<rows.length;index++){
   const row=rows[index]; const mapped:any={};
   let invalidJson=false,invalidDate=false;
   for(const [column,field] of Object.entries(mapping)){
    const value=row[column];
    if(value===undefined||String(value).trim()==="")continue;
    const raw=String(value).trim();
    if(jsonKeys.has(field)){
     try{mapped[field]=JSON.parse(raw);}catch{invalidJson=true;}
    }else if(dateKeys.has(field)){
     const date=value instanceof Date?value:new Date(raw);
     if(!Number.isNaN(date.getTime()))mapped[field]=date;else invalidDate=true;
    }else mapped[field]=raw;
   }
   const employeeId=String(mapped.employeeId||"").trim();
   if(!employeeId||!mapped.fullNameEnglish){skipped++;continue;}
   if(invalidJson||invalidDate||
    ["secondary","higherSecondary","graduation","masters","bed","med","ntrca","otherTraining"].some(key=>mapped[key]!==undefined&&(!mapped[key]||typeof mapped[key]!=="object"||Array.isArray(mapped[key])))||
    (mapped.jobExperiences!==undefined&&(!Array.isArray(mapped.jobExperiences)||mapped.jobExperiences.length>3||mapped.jobExperiences.some((entry:unknown)=>!entry||typeof entry!=="object"||Array.isArray(entry))))){
    skipped++;if(errors.length<5)errors.push(`Row ${index+2}: education must be JSON objects and job experiences must contain no more than three entries.`);continue;
   }
   try {
    const passwordHash=await bcrypt.hash(employeeId,12); const email=`employee-${employeeId}@employees.kcmsc.edu.bd`;
    await prisma.user.create({data:{email,passwordHash,role:"EMPLOYEE",createdById:(s.user as any).id,employee:{create:mapped}}}); created++;
   } catch {skipped++; if(errors.length<5)errors.push(`Row ${index+2}: duplicate employee ID or login email.`);}
  }
  await prisma.auditLog.create({data:{actorId:(s.user as any).id,action:"BULK_IMPORT_EMPLOYEES",entityType:"Employee",metadata:{created,skipped,filename:file.name}}});
  return NextResponse.json({created,skipped,errors});
 } catch {return NextResponse.json({error:"Could not read this spreadsheet. Save it as .xlsx or .csv and try again."},{status:400});}
}
