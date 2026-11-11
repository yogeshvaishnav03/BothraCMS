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

export const VIEW_ONLY_PERMISSIONS: readonly Permission[] = [
  "projects:read",
  "tasks:read",
  "inventory:read",
  "finance:read",
  "attendance:read",
  "reports:read",
  "audit:read",
  "payroll:read",
  "sales:read",
] as const;

export interface ExtraAccessModule {
  key: string;
  group: string;
  accessLevel: "VIEW" | "FULL";
  label: string;
  hint: string;
  permissions: readonly Permission[];
}

export const EXTRA_ACCESS_MODULES: readonly ExtraAccessModule[] = [
  {
    key: "attendance_view",
    group: "attendance",
    accessLevel: "VIEW",
    label: "Attendance & Workers",
    hint: "View attendance history, muster roll & worker roster (view only)",
    permissions: ["attendance:read"],
  },
  {
    key: "attendance_manage",
    group: "attendance",
    accessLevel: "FULL",
    label: "Attendance & Workers",
    hint: "Mark attendance, register/edit workers & fix shifts",
    permissions: ["attendance:read", "attendance:write", "attendance:correct"],
  },
  {
    key: "inventory_view",
    group: "inventory",
    accessLevel: "VIEW",
    label: "Materials, Stock & Orders",
    hint: "View materials, store stock levels & purchase orders (view only)",
    permissions: ["inventory:read"],
  },
  {
    key: "inventory_manage",
    group: "inventory",
    accessLevel: "FULL",
    label: "Materials, Stock & Orders",
    hint: "Receive/issue/transfer stock, adjust balances & place orders",
    permissions: ["inventory:read", "inventory:receipt", "inventory:issue", "inventory:transfer", "inventory:adjust"],
  },
  {
    key: "projects_view",
    group: "projects",
    accessLevel: "VIEW",
    label: "Projects, Drawings & MB",
    hint: "View projects, drawings, measurement book & tasks (view only)",
    permissions: ["projects:read", "tasks:read"],
  },
  {
    key: "projects_manage",
    group: "projects",
    accessLevel: "FULL",
    label: "Projects, Drawings & MB",
    hint: "Create/edit projects, upload drawings, MB & tasks",
    permissions: ["projects:read", "projects:write", "tasks:read", "tasks:write"],
  },
  {
    key: "finance_view",
    group: "finance",
    accessLevel: "VIEW",
    label: "Finance & Day Book",
    hint: "See payments, bills, Day Book totals & accounts exports (view only)",
    permissions: ["finance:read"],
  },
  {
    key: "finance_manage",
    group: "finance",
    accessLevel: "FULL",
    label: "Payments, Bills & Bank",
    hint: "Record bills/payments, edit vendor bank details & reverse entries",
    permissions: ["finance:read", "finance:write", "finance:reverse"],
  },
  {
    key: "payroll_view",
    group: "payroll",
    accessLevel: "VIEW",
    label: "Payroll & Salaries",
    hint: "Inspect monthly payroll runs, deductions & payslips (view only)",
    permissions: ["payroll:read"],
  },
  {
    key: "payroll_manage",
    group: "payroll",
    accessLevel: "FULL",
    label: "Payroll & Approvals",
    hint: "Edit salaries, issue advances & approve monthly payroll",
    permissions: ["payroll:read", "payroll:write"],
  },
  {
    key: "sales_view",
    group: "sales",
    accessLevel: "VIEW",
    label: "Sales & Bookings",
    hint: "View leads, flat bookings, demand letters & receipts (view only)",
    permissions: ["sales:read"],
  },
  {
    key: "sales_manage",
    group: "sales",
    accessLevel: "FULL",
    label: "Sales & Customer Receipts",
    hint: "Manage leads, flat bookings, demand letters & receipts",
    permissions: ["sales:read", "sales:write"],
  },
  {
    key: "reports_view",
    group: "reports",
    accessLevel: "VIEW",
    label: "Reports & Analytics",
    hint: "View operational reports, summaries & exports (view only)",
    permissions: ["reports:read"],
  },
  {
    key: "audit_view",
    group: "audit",
    accessLevel: "VIEW",
    label: "Activity & Audit Log",
    hint: "Review audit history of changes across the company (view only)",
    permissions: ["audit:read"],
  },
  {
    key: "team_settings",
    group: "team",
    accessLevel: "FULL",
    label: "Team, Sites & Settings",
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

