/**
 * Idempotent bootstrap: permissions, system roles, and (optionally) the Principal under the LEADER role
 * plus a first administrator. Run via `npm run db:seed` (Prisma loads .env).
 * Temporary passwords are printed ONCE to this console and never stored in plaintext.
 */
import { PrismaClient } from "@prisma/client";
import { LEADER_PERMISSIONS, ORDINARY_PERMISSIONS, SYSTEM_ROLES, isLeaderPermission } from "../src/lib/permissions";
import { provisionAccount } from "../src/server/auth/credentials";

const prisma = new PrismaClient();

async function seedRbac() {
  for (const key of [...ORDINARY_PERMISSIONS, ...LEADER_PERMISSIONS]) {
    await prisma.permission.upsert({ where: { key }, update: { isLeader: isLeaderPermission(key) }, create: { key, isLeader: isLeaderPermission(key) } });
  }
  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { key: r.key },
      update: { name: r.name, isLeader: r.isLeader },
      create: { key: r.key, name: r.name, isLeader: r.isLeader, isSystem: true },
    });
    const perms = await prisma.permission.findMany({ where: { key: { in: [...r.permissions] } } });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true, // DB trigger rejects any leader/ordinary mismatch
    });
  }
}

async function bootstrapPerson(opts: { staffId?: string; name?: string; roleKey: string; designation: string; label: string }) {
  const staffId = opts.staffId?.trim();
  const name = opts.name?.trim();
  if (!staffId || !name) {
    console.warn(`[seed] ${opts.label}: staff ID / name not set — skipped.`);
    return;
  }
  if (await prisma.staffMember.findUnique({ where: { staffId } })) {
    console.log(`[seed] ${opts.label}: ${staffId} already exists — left unchanged (password NOT reset).`);
    return;
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { key: opts.roleKey } });
  const designation = await prisma.designation.upsert({ where: { name: opts.designation }, update: {}, create: { name: opts.designation } });

  const result = await prisma.$transaction(async (tx) => {
    const staff = await tx.staffMember.create({ data: { staffId, name, designationId: designation.id } });
    const { userId, temporaryPassword } = await provisionAccount(tx, staff.id);
    // Bootstrap grant: the seed is the trusted root, so the account is its own grantor here only.
    await tx.userRole.create({ data: { userId, roleId: role.id, grantedById: userId } });
    await tx.auditEvent.create({
      data: { actorId: userId, action: "seed.bootstrap", entityType: "UserAccount", entityId: userId, metadata: { role: opts.roleKey } },
    });
    return temporaryPassword;
  });
  console.log(`\n[seed] ${opts.label} created. Staff ID: ${staffId}\n[seed] One-time password (shown once, change at first login): ${result}\n`);
}

async function main() {
  await seedRbac();
  if (process.env.SEED_PRINCIPAL_STAFF_ID && process.env.SEED_PRINCIPAL_STAFF_ID === process.env.SEED_ADMIN_STAFF_ID) {
    throw new Error("SEED_PRINCIPAL_STAFF_ID and SEED_ADMIN_STAFF_ID must differ");
  }
  await bootstrapPerson({ staffId: process.env.SEED_PRINCIPAL_STAFF_ID, name: process.env.SEED_PRINCIPAL_NAME, roleKey: "LEADER", designation: "Principal", label: "Principal (Leader)" });
  await bootstrapPerson({ staffId: process.env.SEED_ADMIN_STAFF_ID, name: process.env.SEED_ADMIN_NAME, roleKey: "ADMIN_MANAGER", designation: "Administrator", label: "Administrator" });
}

main().finally(() => prisma.$disconnect());
