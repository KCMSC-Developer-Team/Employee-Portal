import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_DEVELOPER_EMAIL || "developer@example.com";
  const password = process.env.SEED_DEVELOPER_PASSWORD || "ChangeMe-Immediately-123!";
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email, passwordHash, role: Role.DEVELOPER,
      employee: { create: { fullNameEnglish: "System Developer", designation: "Developer" } }
    }
  });
  console.log(`Seeded developer account: ${email}`);
  console.log("Change the default password immediately after first login.");
}
main().finally(() => prisma.$disconnect());
