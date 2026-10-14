import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
async function main() {
  const email = process.env.SEED_DEVELOPER_EMAIL || "zarif@kcmsc.edu.bd";
  const employeeId = "2603";
  const passwordHash = await bcrypt.hash(employeeId, 12);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({where:{id:existing.id},data:{passwordHash,role:Role.DEVELOPER,active:true,employee:{upsert:{create:{fullNameEnglish:"Muhammad Hasan Zarif",designation:"Developer",employeeId},update:{fullNameEnglish:"Muhammad Hasan Zarif",designation:"Developer",employeeId}}}}});
  } else {
    await prisma.user.create({data:{email,passwordHash,role:Role.DEVELOPER,employee:{create:{fullNameEnglish:"Muhammad Hasan Zarif",designation:"Developer",employeeId}}}});
  }
  const unlinked = await prisma.employee.findMany({where:{userId:null,employeeId:{not:null}},select:{id:true,employeeId:true,personalEmail:true}});
  let linkedCount = 0;
  for (const employee of unlinked) {
    if (!employee.employeeId || employee.employeeId === employeeId) continue;
    try {
      await prisma.user.create({data:{email:`employee-${employee.employeeId}@employees.kcmsc.edu.bd`,passwordHash:await bcrypt.hash(employee.employeeId,12),role:Role.EMPLOYEE,employee:{connect:{id:employee.id}}}});
      linkedCount++;
    } catch {
      console.warn(`Could not create login for employee ID ${employee.employeeId}; check for a duplicate ID or reserved login email.`);
    }
  }
  console.log(`Seeded Developer account: employee ID ${employeeId} (login and initial password). Email login remains ${email}.`);
  console.log(`Created ${linkedCount} login account(s) for existing unlinked employees.`);
  console.log("Change the initial password after signing in.");
}
main().finally(() => prisma.$disconnect());
