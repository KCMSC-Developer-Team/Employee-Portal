/**
 * Single source of truth for permissions and system roles.
 * Leader permissions are a SEPARATE class: no ordinary role may include them,
 * and `isLeader` roles may include nothing else (also enforced by a DB trigger).
 */

export const ORDINARY_PERMISSIONS = [
  "dashboard:read",
  "staff:read",
  "staff:create",
  "staff:update",
  "staff:status", // change employment status (e.g. resignation)
  "request:review",
  "account:manage", // issue/reset credentials, enable/disable accounts
  "role:assign:ordinary", // grant NON-leader roles (never to oneself)
  "audit:read", // general audit log (never contains observation text)
  "import:run",
  "report:read",
] as const;

export const LEADER_PERMISSIONS = [
  "observation:read",
  "observation:write",
  "observation:import",
  "leader:grant", // grant/revoke Leader roles and scope (never to oneself)
] as const;

export type OrdinaryPermission = (typeof ORDINARY_PERMISSIONS)[number];
export type LeaderPermission = (typeof LEADER_PERMISSIONS)[number];
export type PermissionKey = OrdinaryPermission | LeaderPermission;

const leaderSet = new Set<string>(LEADER_PERMISSIONS);
export const isLeaderPermission = (k: string): k is LeaderPermission => leaderSet.has(k);

export interface SystemRole {
  key: string;
  name: string;
  isLeader: boolean;
  permissions: readonly PermissionKey[];
}

export const SYSTEM_ROLES: readonly SystemRole[] = [
  // Every staff account implicitly gets self-service; it is NOT a permission on other people's data.
  { key: "EMPLOYEE", name: "Employee", isLeader: false, permissions: [] },
  {
    key: "HR_ADMIN",
    name: "Administrator",
    isLeader: false,
    permissions: [
      "dashboard:read", "staff:read", "staff:create", "staff:update", "staff:status",
      "request:review", "account:manage", "audit:read", "import:run", "report:read",
    ],
  },
  {
    key: "ADMIN_MANAGER",
    name: "Administrator (role manager)",
    isLeader: false,
    permissions: [
      "dashboard:read", "staff:read", "staff:create", "staff:update", "staff:status",
      "request:review", "account:manage", "role:assign:ordinary", "audit:read", "import:run", "report:read",
    ],
  },
  // The Principal is provisioned here (see prisma/seed.ts). Leader ≠ admin: it carries no ordinary permissions,
  // so a Principal who also needs admin screens must be assigned an ordinary admin role explicitly.
  { key: "LEADER", name: "Leader (Principal)", isLeader: true, permissions: LEADER_PERMISSIONS },
];
