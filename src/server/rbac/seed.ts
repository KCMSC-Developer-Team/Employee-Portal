import type { PrismaClient } from "@prisma/client";
import { LEADER_PERMISSIONS, ORDINARY_PERMISSIONS, SYSTEM_ROLES, isLeaderPermission } from "../../lib/permissions";

/** Idempotent: upserts permissions, system roles and their permission links. Shared by the seed script and tests. */
export async function seedRbac(prisma: PrismaClient): Promise<void> {
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
