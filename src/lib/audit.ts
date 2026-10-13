import type { Prisma } from "@prisma/client";
import { hmacHex } from "./crypto";

type Primitive = string | number | boolean | null;

// Audit metadata may carry ids, field KEYS and version numbers only.
// Keys that suggest confidential or credential content are rejected outright (programming error).
const FORBIDDEN_KEY = /body|observation|password|token|secret|nid|passport/i;

export interface AuditInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, Primitive>;
  ip?: string | null;
}

export async function audit(client: Prisma.TransactionClient, e: AuditInput): Promise<void> {
  for (const k of Object.keys(e.metadata ?? {})) {
    if (FORBIDDEN_KEY.test(k)) throw new Error(`Audit metadata key not allowed: ${k}`);
  }
  await client.auditEvent.create({
    data: {
      actorId: e.actorId ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      metadata: e.metadata ?? undefined,
      ipHash: e.ip ? hmacHex(e.ip) : null,
    },
  });
}
