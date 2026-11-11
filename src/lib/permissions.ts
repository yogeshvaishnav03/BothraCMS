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
  | "audit:read"
  | "payroll:read"
  | "payroll:write"
  | "sales:read"
  | "sales:write";

export const ALL_PERMISSIONS: readonly Permission[] = [
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
  "payroll:read",
  "payroll:write",
  "sales:read",
  "sales:write",
] as const;

export const EXTRA_ACCESS_MODULES: readonly {
  key: string;
  label: string;
  hint: string;
  permissions: readonly Permission[];
}[] = [
  {
    key: "attendance_manage",
    label: "Attendance & Workers",
    hint: "View team attendance, Site Master, register workers & fix shifts",
    permissions: ["attendance:read", "attendance:write", "attendance:correct"],
  },
  {
    key: "inventory_manage",
    label: "Materials, Stock & Orders",
    hint: "Receive/issue/transfer stock, place orders & manage materials",
    permissions: ["inventory:read", "inventory:receipt", "inventory:issue", "inventory:transfer", "inventory:adjust"],
  },
  {
    key: "projects_manage",
    label: "Projects, Drawings & MB",
    hint: "Create/edit projects, upload drawings, measurement book & tasks",
    permissions: ["projects:read", "projects:write", "tasks:read", "tasks:write"],
  },
  {
    key: "finance_view",
    label: "View Finance & Day Book",
    hint: "See payments, bills, Day Book totals & accounts exports",
    permissions: ["finance:read"],
  },
  {
    key: "finance_manage",
    label: "Payments, Bills & Vendor Bank",
    hint: "Record bills/payments, edit party bank details & reverse entries",
    permissions: ["finance:read", "finance:write", "finance:reverse"],
  },
  {
    key: "payroll_view",
    label: "View Payroll & Salaries",
    hint: "Inspect monthly payroll runs, deductions & payslips",
    permissions: ["payroll:read"],
  },
  {
    key: "payroll_manage",
    label: "Manage & Approve Payroll",
    hint: "Edit salaries, issue advances & approve monthly payroll",
    permissions: ["payroll:read", "payroll:write"],
  },
  {
    key: "sales_manage",
    label: "Sales, Bookings & Customer Receipts",
    hint: "Manage leads, flat bookings, demand letters & receipts",
    permissions: ["sales:read", "sales:write"],
  },
  {
    key: "audit_view",
    label: "Activity & Audit Log",
    hint: "Review audit history of changes across the company",
    permissions: ["audit:read"],
  },
  {
    key: "team_settings",
    label: "Team, Sites & Company Settings",
    hint: "Manage staff access, construction sites & company settings",
    permissions: ["users:manage", "org:settings", "sites:manage"],
  },
];

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
    "payroll:read",
    "payroll:write",
    "sales:read",
    "sales:write",
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
    "payroll:read",
    "payroll:write",
    "sales:read",
    "sales:write",
  ],
  PROJECT_MANAGER: [
    "projects:read",
    "projects:write",
    "tasks:read",
    "tasks:write",
    "inventory:read",
    "attendance:read",
    "attendance:correct",
    "reports:read",
    "sales:read",
    "sales:write",
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
    "payroll:read",
    "payroll:write",
    "sales:read",
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
    "payroll:read",
  ],
  AUDITOR: [
    "projects:read",
    "tasks:read",
    "inventory:read",
    "finance:read",
    "attendance:read",
    "reports:read",
    "audit:read",
    "payroll:read",
    "sales:read",
  ],
};

const VALID_PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function normalizeExtraPermissions(raw: unknown): Permission[] {
  let list: unknown[] = [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  }
  const seen = new Set<Permission>();
  for (const item of list) {
    if (typeof item === "string" && VALID_PERMISSION_SET.has(item)) {
      seen.add(item as Permission);
    }
  }
  return Array.from(seen);
}

export function computeEffectivePermissions(role: Role | string | undefined, extraPermissions?: unknown): Permission[] {
  const base = (role && ROLE_PERMISSIONS[role as Role]) || [];
  const extras = normalizeExtraPermissions(extraPermissions);
  if (extras.length === 0) return [...base];
  return Array.from(new Set<Permission>([...base, ...extras]));
}

export type PermissionSubject =
  | Role
  | { role?: Role | string; permissions?: readonly string[]; extraPermissions?: readonly string[] }
  | null
  | undefined;

export function hasPermission(roleOrUser: PermissionSubject, permission: Permission): boolean {
  if (!roleOrUser) return false;
  if (typeof roleOrUser === "string") {
    const permissions = ROLE_PERMISSIONS[roleOrUser as Role];
    return Boolean(permissions && permissions.includes(permission));
  }
  if (Array.isArray(roleOrUser.permissions)) {
    return roleOrUser.permissions.includes(permission);
  }
  const combined = computeEffectivePermissions(roleOrUser.role, roleOrUser.extraPermissions);
  return combined.includes(permission);
}

export function assertPermission(roleOrUser: PermissionSubject, permission: Permission): void {
  if (!hasPermission(roleOrUser, permission)) {
    const roleLabel = typeof roleOrUser === "string" ? roleOrUser : roleOrUser?.role || "UNKNOWN";
    throw new Error(`Forbidden: Role ${roleLabel} lacks required permission '${permission}'`);
  }
}

export function canUser(
  user: { role?: Role | string; permissions?: Permission[] | string[]; extraPermissions?: Permission[] | string[] } | null | undefined,
  permission: Permission
): boolean {
  return hasPermission(user, permission);
}

