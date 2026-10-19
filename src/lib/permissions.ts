export type Role =
  | "SUPER_ADMIN"
  | "ORG_ADMIN"
  | "PROJECT_MANAGER"
  | "SITE_SUPERVISOR"
  | "ACCOUNTANT"
  | "STOREKEEPER"
  | "HR_VIEWER"
  | "AUDITOR";

export type Permission =
  | "org:settings"
  | "users:manage"
  | "sites:manage"
  | "projects:read"
  | "projects:write"
  | "tasks:read"
  | "tasks:write"
  | "inventory:read"
  | "inventory:receipt"
  | "inventory:issue"
  | "inventory:transfer"
  | "inventory:adjust"
  | "finance:read"
  | "finance:write"
  | "finance:reverse"
  | "attendance:read"
  | "attendance:write"
  | "attendance:correct"
  | "reports:read"
  | "audit:read";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    "org:settings",
    "users:manage",
    "sites:manage",
    "projects:read",
    "projects:write",
    "tasks:read",
    "tasks:write",
    "inventory:read",
    "inventory:receipt",
    "inventory:issue",
    "inventory:transfer",
    "inventory:adjust",
    "finance:read",
    "finance:write",
    "finance:reverse",
    "attendance:read",
    "attendance:write",
    "attendance:correct",
    "reports:read",
    "audit:read",
  ],
  ORG_ADMIN: [
    "org:settings",
    "users:manage",
    "sites:manage",
    "projects:read",
    "projects:write",
    "tasks:read",
    "tasks:write",
    "inventory:read",
    "inventory:receipt",
    "inventory:issue",
    "inventory:transfer",
    "inventory:adjust",
    "finance:read",
    "finance:write",
    "finance:reverse",
    "attendance:read",
    "attendance:write",
    "attendance:correct",
    "reports:read",
    "audit:read",
  ],
  PROJECT_MANAGER: [
    "projects:read",
    "projects:write",
    "tasks:read",
    "tasks:write",
    "inventory:read",
    "finance:read",
    "attendance:read",
    "attendance:correct",
    "reports:read",
  ],
  SITE_SUPERVISOR: [
    "projects:read",
    "tasks:read",
    "tasks:write",
    "inventory:read",
    "inventory:receipt",
    "inventory:issue",
    "attendance:read",
    "attendance:write",
    "reports:read",
  ],
  ACCOUNTANT: [
    "projects:read",
    "tasks:read",
    "tasks:write",
    "inventory:read",
    "finance:read",
    "finance:write",
    "finance:reverse",
    "reports:read",
  ],
  STOREKEEPER: [
    "projects:read",
    "tasks:read",
    "tasks:write",
    "inventory:read",
    "inventory:receipt",
    "inventory:issue",
    "inventory:transfer",
    "inventory:adjust",
    "reports:read",
  ],
  HR_VIEWER: [
    "projects:read",
    "tasks:read",
    "tasks:write",
    "attendance:read",
    "attendance:write",
    "attendance:correct",
    "reports:read",
  ],
  AUDITOR: [
    "projects:read",
    "tasks:read",
    "inventory:read",
    "finance:read",
    "attendance:read",
    "reports:read",
    "audit:read",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Forbidden: Role ${role} lacks required permission '${permission}'`);
  }
}
