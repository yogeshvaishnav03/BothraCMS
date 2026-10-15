/**
 * Comprehensive In-Memory Dynamic Store for BothraCMS / Build Track Pro
 * Provides seamless real-time in-memory persistence when a database connection
 * is offline or unconfigured on serverless platforms (e.g. Vercel).
 */

export interface DynamicOrg {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
  settings: {
    taxId?: string;
    companyAddress?: string;
    phone?: string;
    workDayHours?: number;
    lowStockThresholdMultiplier?: number;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    lastLoginAt: string | null;
  }>;
  _count: {
    sites: number;
    projects: number;
    workforceMembers: number;
    materials: number;
    bills: number;
  };
}

const initialOrg: DynamicOrg = {
  id: "demo-org-1",
  name: "Bothra Infrastructure & Builders",
  currency: "INR",
  timezone: "Asia/Kolkata",
  status: "ACTIVE",
  settings: {
    taxId: "07AAAAA0000A1Z5",
    companyAddress: "Plot 42, Sector 62, Noida, Uttar Pradesh 201309",
    phone: "+91 11 2345 6789",
    workDayHours: 8,
    lowStockThresholdMultiplier: 1.2,
  },
  users: [
    {
      id: "usr-admin-1",
      name: "Yogesh Vaishnav",
      email: "admin@buildtrack.pro",
      role: "ORG_ADMIN",
      status: "ACTIVE",
      lastLoginAt: new Date().toISOString(),
    },
    {
      id: "usr-pm-1",
      name: "Arjun Verma",
      email: "pm@buildtrack.pro",
      role: "PROJECT_MANAGER",
      status: "ACTIVE",
      lastLoginAt: new Date().toISOString(),
    },
    {
      id: "usr-sup-1",
      name: "Rajesh Kumar",
      email: "supervisor@buildtrack.pro",
      role: "SITE_SUPERVISOR",
      status: "ACTIVE",
      lastLoginAt: null,
    },
    {
      id: "usr-store-1",
      name: "Mohan Lal",
      email: "store@buildtrack.pro",
      role: "STOREKEEPER",
      status: "ACTIVE",
      lastLoginAt: null,
    },
    {
      id: "usr-fin-1",
      name: "Pooja Sharma",
      email: "finance@buildtrack.pro",
      role: "ACCOUNTANT",
      status: "ACTIVE",
      lastLoginAt: null,
    },
  ],
  _count: {
    sites: 2,
    projects: 2,
    workforceMembers: 6,
    materials: 4,
    bills: 2,
  },
};

const initialSites = [
  {
    id: "demo-site-1",
    name: "Sector 62 Business District",
    code: "S62",
    address: "Sector 62, Noida, NCR",
    stores: [{ id: "demo-store-1", name: "Central Material Yard" }],
    _count: { projects: 1, workforceMembers: 4 },
  },
  {
    id: "demo-site-2",
    name: "Expressway Junction Corridor",
    code: "EXP",
    address: "Expressway Junction, Greater Noida",
    stores: [{ id: "demo-store-2", name: "Expressway Site Store" }],
    _count: { projects: 1, workforceMembers: 2 },
  },
];

const initialStores = [
  {
    id: "demo-store-1",
    siteId: "demo-site-1",
    name: "Central Material Yard",
    status: "ACTIVE",
    site: { id: "demo-site-1", name: "Sector 62 Business District", code: "S62" },
    _count: { stockBalances: 4, stockMovements: 12 },
  },
  {
    id: "demo-store-2",
    siteId: "demo-site-2",
    name: "Expressway Site Store",
    status: "ACTIVE",
    site: { id: "demo-site-2", name: "Expressway Junction Corridor", code: "EXP" },
    _count: { stockBalances: 2, stockMovements: 5 },
  },
];

const initialProjects = [
  {
    id: "demo-prj-1",
    siteId: "demo-site-1",
    code: "PRJ-SKY-01",
    name: "Skyline Commercial Tower - Phase 1",
    status: "IN_PROGRESS",
    budgetAmount: 450000000,
    startDate: "2026-01-15T00:00:00.000Z",
    endDate: "2026-12-31T00:00:00.000Z",
    notes: "Commercial tower with 24 floors. Currently on 14th floor structural slab.",
    site: { id: "demo-site-1", name: "Sector 62 Business District", code: "S62" },
    manager: { id: "usr-pm-1", name: "Arjun Verma", email: "pm@buildtrack.pro" },
    _count: { tasks: 4, dailyReports: 3, stockMovements: 12 },
    createdAt: "2026-01-15T00:00:00.000Z",
    financials: {
      budgetAmount: 450000000,
      totalBilled: 12000000,
      totalPaid: 9500000,
      outstandingAmount: 2500000,
    },
    tasks: [],
    dailyReports: [],
    stockMovements: [],
    bills: [],
  },
  {
    id: "demo-prj-2",
    siteId: "demo-site-2",
    code: "PRJ-METRO-02",
    name: "Metro Line Extension - Package B",
    status: "IN_PROGRESS",
    budgetAmount: 850000000,
    startDate: "2026-02-01T00:00:00.000Z",
    endDate: "2027-06-30T00:00:00.000Z",
    notes: "Elevated viaduct and 3 underground stations package.",
    site: { id: "demo-site-2", name: "Expressway Junction Corridor", code: "EXP" },
    manager: { id: "usr-pm-1", name: "Arjun Verma", email: "pm@buildtrack.pro" },
    _count: { tasks: 3, dailyReports: 2, stockMovements: 8 },
    createdAt: "2026-02-01T00:00:00.000Z",
    financials: {
      budgetAmount: 850000000,
      totalBilled: 8500000,
      totalPaid: 6000000,
      outstandingAmount: 2500000,
    },
    tasks: [],
    dailyReports: [],
    stockMovements: [],
    bills: [],
  },
];

const initialTasks = [
  {
    id: "demo-task-1",
    projectId: "demo-prj-1",
    title: "Concrete Pouring - Level 4 Slab",
    description: "Grade M35 ready-mix concrete pouring for central core and beam structure.",
    status: "TODO",
    priority: "HIGH",
    dueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    project: { id: "demo-prj-1", code: "PRJ-SKY-01", name: "Skyline Commercial Tower - Phase 1", site: { name: "Sector 62 Business District" } },
    assignee: { id: "usr-sup-1", name: "Rajesh Kumar", email: "supervisor@buildtrack.pro" },
    creator: { id: "usr-pm-1", name: "Arjun Verma" },
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-task-2",
    projectId: "demo-prj-2",
    title: "Reinforcement Steel Inspection",
    description: "Quality and tolerance checks on Fe550D TMT reinforcement bars before shuttering.",
    status: "IN_PROGRESS",
    priority: "CRITICAL",
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    project: { id: "demo-prj-2", code: "PRJ-METRO-02", name: "Metro Line Extension - Package B", site: { name: "Expressway Junction Corridor" } },
    assignee: { id: "usr-sup-1", name: "Rajesh Kumar", email: "supervisor@buildtrack.pro" },
    creator: { id: "usr-admin-1", name: "Vikram Malhotra" },
    createdAt: new Date().toISOString(),
  },
];

const initialWorkforce = [
  {
    id: "wf-1",
    employeeCode: "EMP-001",
    name: "Ramesh Sharma",
    workerType: "MASON",
    phone: "+91 98765 11223",
    defaultSiteId: "demo-site-1",
    dailyWageRate: 850,
    active: true,
    defaultSite: { id: "demo-site-1", name: "Sector 62 Business District", code: "S62" },
  },
  {
    id: "wf-2",
    employeeCode: "EMP-002",
    name: "Suresh Yadav",
    workerType: "CARPENTER",
    phone: "+91 98765 22334",
    defaultSiteId: "demo-site-1",
    dailyWageRate: 900,
    active: true,
    defaultSite: { id: "demo-site-1", name: "Sector 62 Business District", code: "S62" },
  },
  {
    id: "wf-3",
    employeeCode: "EMP-003",
    name: "Sunil Verma",
    workerType: "ELECTRICIAN",
    phone: "+91 98765 33445",
    defaultSiteId: "demo-site-2",
    dailyWageRate: 950,
    active: true,
    defaultSite: { id: "demo-site-2", name: "Expressway Junction Corridor", code: "EXP" },
  },
  {
    id: "wf-4",
    employeeCode: "EMP-004",
    name: "Dinesh Singh",
    workerType: "SITE_ENGINEER",
    phone: "+91 98765 44556",
    defaultSiteId: "demo-site-1",
    dailyWageRate: 1500,
    active: true,
    defaultSite: { id: "demo-site-1", name: "Sector 62 Business District", code: "S62" },
  },
];

const initialAttendance = [
  {
    id: "att-1",
    workforceMemberId: "wf-1",
    siteId: "demo-site-1",
    projectId: "demo-prj-1",
    workDate: new Date().toISOString().split("T")[0],
    checkInAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    checkOutAt: null,
    status: "PRESENT",
    totalHours: 4,
    notes: "Shift start on Level 4",
    workforceMember: initialWorkforce[0],
    site: initialSites[0],
    project: initialProjects[0],
    creator: { id: "usr-sup-1", name: "Rajesh Kumar" },
  },
  {
    id: "att-2",
    workforceMemberId: "wf-2",
    siteId: "demo-site-1",
    projectId: "demo-prj-1",
    workDate: new Date().toISOString().split("T")[0],
    checkInAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    checkOutAt: null,
    status: "PRESENT",
    totalHours: 4,
    notes: "Shuttering work",
    workforceMember: initialWorkforce[1],
    site: initialSites[0],
    project: initialProjects[0],
    creator: { id: "usr-sup-1", name: "Rajesh Kumar" },
  },
];

const initialMaterials = [
  {
    id: "mat-1",
    sku: "MAT-STL-16MM",
    name: "Structural Steel TMT 16mm Fe550D",
    unitCode: "TONNE",
    uom: "TONNE",
    minStockQty: 10,
    reorderQty: 25,
    totalStock: 35,
    isLowStock: false,
    category: { name: "Metals & Steel" },
    stockBalances: [
      { id: "sb-1", storeId: "demo-store-1", quantityOnHand: 25, store: { name: "Central Material Yard", site: { name: "Sector 62 Business District" } } },
      { id: "sb-2", storeId: "demo-store-2", quantityOnHand: 10, store: { name: "Expressway Site Store", site: { name: "Expressway Junction Corridor" } } },
    ],
  },
  {
    id: "mat-2",
    sku: "MAT-CMT-OPC53",
    name: "Ordinary Portland Cement 53 Grade",
    unitCode: "BAG",
    uom: "BAG",
    minStockQty: 50,
    reorderQty: 200,
    totalStock: 120,
    isLowStock: false,
    category: { name: "Cement & Aggregates" },
    stockBalances: [
      { id: "sb-3", storeId: "demo-store-1", quantityOnHand: 120, store: { name: "Central Material Yard", site: { name: "Sector 62 Business District" } } },
    ],
  },
  {
    id: "mat-3",
    sku: "MAT-RMC-M35",
    name: "Ready-Mix Concrete Grade M35",
    unitCode: "TONNE",
    uom: "TONNE",
    minStockQty: 20,
    reorderQty: 50,
    totalStock: 15,
    isLowStock: true,
    category: { name: "Cement & Aggregates" },
    stockBalances: [
      { id: "sb-4", storeId: "demo-store-1", quantityOnHand: 15, store: { name: "Central Material Yard", site: { name: "Sector 62 Business District" } } },
    ],
  },
];

const initialParties = [
  {
    id: "demo-party-1",
    name: "Tata Steel Ltd",
    partyType: "VENDOR",
    phone: "+91 98765 43210",
    email: "sales@tatasteel.com",
    address: "Jamshedpur, Jharkhand",
    taxIdentifier: "GSTIN20AAAAT1234A1Z5",
    notes: "Primary supplier of structural reinforcement steel",
    totalBilled: 12000000,
    totalPaid: 9500000,
    outstandingBalance: 2500000,
  },
  {
    id: "demo-party-2",
    name: "UltraTech Cement Supplies",
    partyType: "VENDOR",
    phone: "+91 98111 22334",
    email: "orders@ultratech.com",
    address: "Mumbai, Maharashtra",
    taxIdentifier: "GSTIN27AAACU5678B1Z2",
    notes: "Bulk OPC-53 cement supplier",
    totalBilled: 8500000,
    totalPaid: 6000000,
    outstandingBalance: 2500000,
  },
  {
    id: "demo-party-3",
    name: "Apex Engineering Contractors",
    partyType: "CONTRACTOR",
    phone: "+91 98222 33445",
    email: "contact@apexeng.in",
    address: "New Delhi, Delhi",
    taxIdentifier: "GSTIN07AABCA1234C1Z9",
    notes: "Civil and RCC structure subcontractor",
    totalBilled: 15000000,
    totalPaid: 15000000,
    outstandingBalance: 0,
  },
];

const initialBills = [
  {
    id: "bill-1",
    partyId: "demo-party-1",
    projectId: "demo-prj-1",
    billNumber: "INV-TATA-2026-089",
    billDate: "2026-02-10T00:00:00.000Z",
    dueDate: "2026-03-10T00:00:00.000Z",
    totalAmount: 12000000,
    paidAmount: 9500000,
    outstandingAmount: 2500000,
    status: "POSTED",
    notes: "Supply of 150 Tonnes Fe550D TMT bars",
    party: initialParties[0],
    project: initialProjects[0],
    lines: [
      {
        id: "bl-1",
        description: "Fe550D TMT Reinforcement Steel 16mm",
        quantity: 150,
        unitRate: 80000,
        lineTotal: 12000000,
      },
    ],
    allocations: [{ id: "ba-1", amount: 9500000, paymentId: "pay-1" }],
  },
];

const initialPayments = [
  {
    id: "pay-1",
    partyId: "demo-party-1",
    paymentNumber: "PAY-2026-0012",
    paymentDate: "2026-02-25T00:00:00.000Z",
    amount: 9500000,
    status: "POSTED",
    paymentMode: "NEFT",
    referenceNumber: "NEFT-HDFC-99182371",
    notes: "Part payment against INV-TATA-2026-089",
    party: initialParties[0],
    allocations: [{ id: "ba-1", billId: "bill-1", amount: 9500000, bill: initialBills[0] }],
  },
];

const initialDailyReports = [
  {
    id: "dr-1",
    projectId: "demo-prj-1",
    reportDate: new Date().toISOString().split("T")[0],
    progress: "Completed shuttering and binding on Level 4 east wing. Concrete pump set up for tomorrow morning.",
    blockers: "Slight delay in morning cement truck delivery due to city traffic advisory.",
    safetyNotes: "Safety briefing conducted at 08:30. 100% PPE compliance verified on floor slab.",
    weather: "Clear / 28°C",
    workforceCount: 28,
    project: {
      id: "demo-prj-1",
      code: "PRJ-SKY-01",
      name: "Skyline Commercial Tower - Phase 1",
      site: { id: "demo-site-1", name: "Sector 62 Business District", code: "S62" },
    },
    creator: { id: "usr-sup-1", name: "Rajesh Kumar", role: "SITE_SUPERVISOR" },
    createdAt: new Date().toISOString(),
  },
];

const initialAudit = [
  {
    id: "aud-1",
    action: "USER_LOGIN",
    entityType: "USER",
    entityId: "usr-admin-1",
    actorUser: { id: "usr-admin-1", name: "Vikram Malhotra", email: "admin@buildtrack.pro" },
    createdAt: new Date().toISOString(),
    details: "Authenticated via secure web session",
  },
  {
    id: "aud-2",
    action: "ORGANIZATION_SETTINGS_UPDATED",
    entityType: "ORGANIZATION",
    entityId: "demo-org-1",
    actorUser: { id: "usr-admin-1", name: "Vikram Malhotra", email: "admin@buildtrack.pro" },
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    details: "Updated company address and work hours",
  },
];

const initialTenants = [
  {
    id: "demo-org-1",
    name: "Apex Infrastructure & Builders",
    currency: "INR",
    timezone: "Asia/Kolkata",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    _count: { users: 5, sites: 2, projects: 2 },
  },
];

// Attach persistent dynamic store to globalThis
const g = globalThis as any;
if (!g.__DYNAMIC_STORE__) {
  g.__DYNAMIC_STORE__ = {
    org: { ...initialOrg },
    sites: [...initialSites],
    stores: [...initialStores],
    projects: [...initialProjects],
    tasks: [...initialTasks],
    workforce: [...initialWorkforce],
    attendance: [...initialAttendance],
    materials: [...initialMaterials],
    parties: [...initialParties],
    bills: [...initialBills],
    payments: [...initialPayments],
    dailyReports: [...initialDailyReports],
    audit: [...initialAudit],
    tenants: [...initialTenants],
  };
}

export const dynamicStore = {
  // --- ORGANIZATION ---
  getOrg(): DynamicOrg {
    const org = g.__DYNAMIC_STORE__.org;
    org._count = {
      sites: g.__DYNAMIC_STORE__.sites.length,
      projects: g.__DYNAMIC_STORE__.projects.length,
      workforceMembers: g.__DYNAMIC_STORE__.workforce.length,
      materials: g.__DYNAMIC_STORE__.materials.length,
      bills: g.__DYNAMIC_STORE__.bills.length,
    };
    return org;
  },
  updateOrg(update: Partial<DynamicOrg> & { settings?: any }): DynamicOrg {
    const current = g.__DYNAMIC_STORE__.org;
    const merged = {
      ...current,
      ...update,
      settings: {
        ...current.settings,
        ...(update.settings || {}),
      },
    };
    g.__DYNAMIC_STORE__.org = merged;
    return merged;
  },

  // --- KPI METRICS ---
  getKpiMetrics(siteId?: string) {
    const projs = siteId
      ? g.__DYNAMIC_STORE__.projects.filter((p: any) => p.siteId === siteId)
      : g.__DYNAMIC_STORE__.projects;
    const activeProjectsCount = projs.filter((p: any) => p.status === "PLANNING" || p.status === "IN_PROGRESS").length;

    const todayStr = new Date().toISOString().split("T")[0];
    const now = Date.now();

    const tasks = siteId
      ? g.__DYNAMIC_STORE__.tasks.filter((t: any) => t.project?.siteId === siteId || projs.some((p: any) => p.id === t.projectId))
      : g.__DYNAMIC_STORE__.tasks;

    const tasksDueTodayCount = tasks.filter((t: any) => {
      if (t.status === "COMPLETED") return false;
      if (!t.dueAt) return false;
      return t.dueAt.startsWith(todayStr);
    }).length;

    const tasksOverdueCount = tasks.filter((t: any) => {
      if (t.status === "COMPLETED") return false;
      if (!t.dueAt) return false;
      return new Date(t.dueAt).getTime() < now;
    }).length;

    const atts = siteId
      ? g.__DYNAMIC_STORE__.attendance.filter((a: any) => a.siteId === siteId)
      : g.__DYNAMIC_STORE__.attendance;
    const workersPresentTodayCount = atts.filter((a: any) => 
      a.workDate === todayStr && ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status)
    ).length;

    const materials = g.__DYNAMIC_STORE__.materials;
    const lowStockItemsCount = materials.filter((m: any) => m.isLowStock || (m.minStockQty > 0 && m.totalStock <= m.minStockQty)).length;

    const payments = g.__DYNAMIC_STORE__.payments;
    const paymentsMadeTodayAmount = payments
      .filter((p: any) => p.status === "POSTED" && (p.paymentDate || "").startsWith(todayStr))
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    const bills = g.__DYNAMIC_STORE__.bills;
    const totalOutstandingPayablesAmount = bills
      .filter((b: any) => b.status === "POSTED")
      .reduce((sum: number, b: any) => sum + (b.outstandingAmount !== undefined ? b.outstandingAmount : (b.totalAmount - (b.paidAmount || 0))), 0);

    return {
      activeProjectsCount,
      tasksDueTodayCount,
      tasksOverdueCount,
      workersPresentTodayCount,
      lowStockItemsCount,
      paymentsMadeTodayAmount,
      totalOutstandingPayablesAmount,
    };
  },

  // --- SITES ---
  getSites() {
    return g.__DYNAMIC_STORE__.sites;
  },
  addSite(data: any) {
    const newSite = {
      id: `site-${Date.now()}`,
      name: data.name,
      code: data.code || `S-${Date.now().toString().slice(-3)}`,
      address: data.address || "",
      stores: [{ id: `store-${Date.now()}`, name: `${data.name} Storage Yard` }],
      _count: { projects: 0, workforceMembers: 0 },
    };
    g.__DYNAMIC_STORE__.sites.unshift(newSite);
    g.__DYNAMIC_STORE__.stores.unshift({
      id: `store-${Date.now()}`,
      siteId: newSite.id,
      name: `${data.name} Storage Yard`,
      status: "ACTIVE",
      site: { id: newSite.id, name: newSite.name, code: newSite.code },
      _count: { stockBalances: 0, stockMovements: 0 },
    });
    g.__DYNAMIC_STORE__.org._count.sites = g.__DYNAMIC_STORE__.sites.length;
    return newSite;
  },

  // --- STORES ---
  getStores(siteId?: string | null) {
    if (siteId) {
      return g.__DYNAMIC_STORE__.stores.filter((s: any) => s.siteId === siteId);
    }
    return g.__DYNAMIC_STORE__.stores;
  },
  addStore(data: any) {
    const site = g.__DYNAMIC_STORE__.sites.find((s: any) => s.id === data.siteId) || {
      id: data.siteId,
      name: "Main Site",
      code: "S1",
    };
    const newStore = {
      id: `store-${Date.now()}`,
      siteId: data.siteId,
      name: data.name,
      status: "ACTIVE",
      site: { id: site.id, name: site.name, code: site.code },
      _count: { stockBalances: 0, stockMovements: 0 },
    };
    g.__DYNAMIC_STORE__.stores.unshift(newStore);
    return newStore;
  },

  // --- PROJECTS ---
  getProjects(siteId?: string | null, status?: string | null) {
    let projs = g.__DYNAMIC_STORE__.projects;
    if (siteId) projs = projs.filter((p: any) => p.siteId === siteId);
    if (status) projs = projs.filter((p: any) => p.status === status);
    return projs;
  },
  getProject(id: string) {
    const p = g.__DYNAMIC_STORE__.projects.find((proj: any) => proj.id === id);
    if (!p) return null;
    return {
      ...p,
      tasks: g.__DYNAMIC_STORE__.tasks.filter((t: any) => t.projectId === id),
      dailyReports: g.__DYNAMIC_STORE__.dailyReports.filter((r: any) => r.projectId === id),
      bills: g.__DYNAMIC_STORE__.bills.filter((b: any) => b.projectId === id),
      stockMovements: [],
    };
  },
  addProject(data: any) {
    const site = g.__DYNAMIC_STORE__.sites.find((s: any) => s.id === data.siteId) || {
      id: data.siteId,
      name: "Main Site",
      code: "SITE-1",
    };
    const newProj = {
      id: `proj-${Date.now()}`,
      code: data.code || `PRJ-${Date.now().toString().slice(-4)}`,
      name: data.name,
      siteId: data.siteId,
      budgetAmount: Number(data.budgetAmount) || 0,
      startDate: data.startDate || new Date().toISOString(),
      endDate: data.endDate || null,
      notes: data.notes || "",
      status: "IN_PROGRESS",
      site: { id: site.id, name: site.name, code: site.code },
      manager: { id: "usr-pm-1", name: "Arjun Verma", email: "pm@buildtrack.pro" },
      _count: { tasks: 0, dailyReports: 0, stockMovements: 0 },
      financials: {
        budgetAmount: Number(data.budgetAmount) || 0,
        totalBilled: 0,
        totalPaid: 0,
        outstandingAmount: 0,
      },
      tasks: [],
      dailyReports: [],
      stockMovements: [],
      bills: [],
      createdAt: new Date().toISOString(),
    };
    g.__DYNAMIC_STORE__.projects.unshift(newProj);
    g.__DYNAMIC_STORE__.org._count.projects = g.__DYNAMIC_STORE__.projects.length;
    return newProj;
  },

  // --- TASKS ---
  getTasks(filter?: { projectId?: string | null; status?: string | null; priority?: string | null }) {
    let tasks = g.__DYNAMIC_STORE__.tasks;
    if (filter?.projectId) tasks = tasks.filter((t: any) => t.projectId === filter.projectId);
    if (filter?.status) tasks = tasks.filter((t: any) => t.status === filter.status);
    if (filter?.priority) tasks = tasks.filter((t: any) => t.priority === filter.priority);
    return tasks;
  },
  addTask(data: any) {
    const proj = g.__DYNAMIC_STORE__.projects.find((p: any) => p.id === data.projectId) || {
      id: data.projectId,
      code: "PRJ-GEN",
      name: "General Project",
      site: { name: "Main Site" },
    };
    const newTask = {
      id: `task-${Date.now()}`,
      projectId: data.projectId,
      title: data.title,
      description: data.description || "",
      status: "TODO",
      priority: data.priority || "MEDIUM",
      dueAt: data.dueAt || new Date(Date.now() + 86400000 * 3).toISOString(),
      project: { id: proj.id, code: proj.code, name: proj.name, site: proj.site },
      assignee: { id: "usr-sup-1", name: "Rajesh Kumar", email: "supervisor@buildtrack.pro" },
      creator: { id: "usr-admin-1", name: "Vikram Malhotra" },
      createdAt: new Date().toISOString(),
    };
    g.__DYNAMIC_STORE__.tasks.unshift(newTask);
    return newTask;
  },
  updateTaskStatus(taskId: string, status: string, note?: string) {
    const task = g.__DYNAMIC_STORE__.tasks.find((t: any) => t.id === taskId);
    if (task) {
      task.status = status;
      if (note) task.note = note;
    }
    return task;
  },

  // --- WORKFORCE ---
  getWorkforce(filter?: { siteId?: string | null; workerType?: string | null }) {
    let workers = g.__DYNAMIC_STORE__.workforce;
    if (filter?.siteId) workers = workers.filter((w: any) => w.defaultSiteId === filter.siteId);
    if (filter?.workerType) workers = workers.filter((w: any) => w.workerType === filter.workerType);
    return workers;
  },
  addWorkforce(data: any) {
    const site = g.__DYNAMIC_STORE__.sites.find((s: any) => s.id === data.defaultSiteId) || initialSites[0];
    const newWorker = {
      id: `wf-${Date.now()}`,
      employeeCode: data.employeeCode,
      name: data.name,
      workerType: data.workerType,
      phone: data.phone || "",
      defaultSiteId: data.defaultSiteId,
      dailyWageRate: Number(data.dailyWageRate) || 800,
      active: true,
      defaultSite: site,
      createdAt: new Date().toISOString(),
    };
    g.__DYNAMIC_STORE__.workforce.unshift(newWorker);
    g.__DYNAMIC_STORE__.org._count.workforceMembers = g.__DYNAMIC_STORE__.workforce.length;
    return newWorker;
  },

  // --- ATTENDANCE ---
  getAttendance(workDate?: string, siteId?: string) {
    let records = g.__DYNAMIC_STORE__.attendance;
    if (workDate) records = records.filter((r: any) => r.workDate === workDate);
    if (siteId) records = records.filter((r: any) => r.siteId === siteId);
    return records;
  },
  checkIn(data: any) {
    const worker = g.__DYNAMIC_STORE__.workforce.find((w: any) => w.id === data.workforceMemberId) || initialWorkforce[0];
    const site = g.__DYNAMIC_STORE__.sites.find((s: any) => s.id === data.siteId) || initialSites[0];
    const project = g.__DYNAMIC_STORE__.projects[0];
    const session = {
      id: `att-${Date.now()}`,
      workforceMemberId: data.workforceMemberId,
      siteId: data.siteId,
      projectId: project.id,
      workDate: data.workDate || new Date().toISOString().split("T")[0],
      checkInAt: new Date().toISOString(),
      checkOutAt: null,
      status: "PRESENT",
      totalHours: 0,
      notes: data.notes || "Shift started",
      workforceMember: worker,
      site: site,
      project: project,
      creator: { id: "usr-sup-1", name: "Rajesh Kumar" },
    };
    g.__DYNAMIC_STORE__.attendance.unshift(session);
    return session;
  },
  checkOut(sessionId: string) {
    const session = g.__DYNAMIC_STORE__.attendance.find((s: any) => s.id === sessionId);
    if (session) {
      session.checkOutAt = new Date().toISOString();
      const diffMs = Date.now() - new Date(session.checkInAt).getTime();
      session.totalHours = Math.max(1, Math.round(diffMs / 3600000));
    }
    return session;
  },
  correctAttendance(sessionId: string, data: any) {
    const session = g.__DYNAMIC_STORE__.attendance.find((s: any) => s.id === sessionId);
    if (session) {
      session.status = data.status;
      session.correctionReason = data.reason;
    }
    return session;
  },

  // --- MATERIALS ---
  getMaterials(search?: string | null) {
    let mats = g.__DYNAMIC_STORE__.materials;
    if (search) {
      const q = search.toLowerCase();
      mats = mats.filter((m: any) => m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q));
    }
    return mats;
  },
  getMaterial(id: string) {
    return g.__DYNAMIC_STORE__.materials.find((m: any) => m.id === id);
  },
  addMaterial(data: any) {
    const newMat = {
      id: `mat-${Date.now()}`,
      sku: data.sku,
      name: data.name,
      unitCode: data.unitCode,
      uom: data.unitCode,
      minStockQty: Number(data.minStockQty) || 0,
      reorderQty: Number(data.reorderQty) || 0,
      totalStock: 0,
      isLowStock: false,
      category: { name: "General Materials" },
      stockBalances: [],
    };
    g.__DYNAMIC_STORE__.materials.unshift(newMat);
    g.__DYNAMIC_STORE__.org._count.materials = g.__DYNAMIC_STORE__.materials.length;
    return newMat;
  },
  getMaterialLedger(materialId: string) {
    const mat = g.__DYNAMIC_STORE__.materials.find((m: any) => m.id === materialId) || g.__DYNAMIC_STORE__.materials[0];
    const currentBalance = mat ? (mat.totalStock || 35) : 35;
    const unitCode = mat ? (mat.unitCode || mat.uom || "TONNE") : "TONNE";
    return {
      material: {
        id: mat ? mat.id : materialId,
        name: mat ? mat.name : "Structural Steel TMT 16mm",
        sku: mat ? mat.sku : "MAT-STL-16MM",
        unitCode,
      },
      currentBalance,
      totalReceived: currentBalance + 15,
      totalIssued: 15,
      entries: [
        {
          id: `mov-${Date.now()}-1`,
          date: new Date(Date.now() - 86400000 * 4).toISOString(),
          type: "RECEIPT",
          storeName: "Central Material Yard",
          vendorName: "Tata Steel Ltd",
          referenceDoc: "GRN-2026-0082",
          quantityDelta: currentBalance + 15,
          unitCode,
          unitRate: 8000000,
          runningBalance: currentBalance + 15,
          projectName: "Skyline Commercial Tower - Phase 1",
          taskTitle: "Inward Delivery",
          createdByName: "Mohan Lal",
        },
        {
          id: `mov-${Date.now()}-2`,
          date: new Date(Date.now() - 86400000 * 2).toISOString(),
          type: "ISSUE",
          storeName: "Central Material Yard",
          vendorName: "Apex Contractors",
          referenceDoc: "ISS-2026-0031",
          quantityDelta: -15,
          unitCode,
          unitRate: 8000000,
          runningBalance: currentBalance,
          projectName: "Skyline Commercial Tower - Phase 1",
          taskTitle: "Reinforcement Steel Inspection",
          createdByName: "Rajesh Kumar",
        },
      ],
    };
  },

  // --- PARTIES ---
  getParties(typeFilter?: string | null) {
    let parties = g.__DYNAMIC_STORE__.parties;
    if (typeFilter && typeFilter !== "ALL") {
      parties = parties.filter((p: any) => p.partyType === typeFilter || p.partyType === "BOTH");
    }
    return parties;
  },
  getParty(id: string) {
    return g.__DYNAMIC_STORE__.parties.find((p: any) => p.id === id);
  },
  addParty(data: any) {
    const newParty = {
      id: `party-${Date.now()}`,
      name: data.name,
      partyType: data.partyType,
      phone: data.phone || "",
      email: data.email || "",
      address: data.address || "",
      taxIdentifier: data.taxIdentifier || "",
      notes: data.notes || "",
      totalBilled: 0,
      totalPaid: 0,
      outstandingBalance: 0,
    };
    g.__DYNAMIC_STORE__.parties.unshift(newParty);
    return newParty;
  },
  getPartyStatement(partyId: string) {
    const party = g.__DYNAMIC_STORE__.parties.find((p: any) => p.id === partyId) || g.__DYNAMIC_STORE__.parties[0];
    const bills = g.__DYNAMIC_STORE__.bills.filter((b: any) => b.partyId === party.id);
    const payments = g.__DYNAMIC_STORE__.payments.filter((p: any) => p.partyId === party.id);
    const totalBilled = bills.reduce((s: number, b: any) => s + (b.totalAmount || 0), 0);
    const totalPaid = payments
      .filter((p: any) => p.status === "POSTED")
      .reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const outstandingBalance = Math.max(0, totalBilled - totalPaid);

    return {
      party,
      totalBilled,
      totalPaid,
      outstandingBalance,
      bills: bills.map((b: any) => ({
        ...b,
        paidAmount: b.paidAmount || 0,
        outstandingAmount: b.outstandingAmount !== undefined ? b.outstandingAmount : (b.totalAmount - (b.paidAmount || 0)),
      })),
      payments: payments.map((p: any) => ({
        ...p,
        method: p.paymentMode || p.method || "BANK_TRANSFER",
      })),
    };
  },

  // --- BILLS & PAYMENTS ---
  getBills(partyId?: string | null) {
    let bills = g.__DYNAMIC_STORE__.bills;
    if (partyId) bills = bills.filter((b: any) => b.partyId === partyId);
    return bills;
  },
  createBill(data: any) {
    const party = g.__DYNAMIC_STORE__.parties.find((p: any) => p.id === data.partyId) || g.__DYNAMIC_STORE__.parties[0];
    const project = g.__DYNAMIC_STORE__.projects.find((pr: any) => pr.id === data.projectId) || g.__DYNAMIC_STORE__.projects[0];
    const total = data.lines.reduce((s: number, l: any) => s + (l.lineTotal || ((l.quantity || 1) * (l.unitRate || 0))), 0);
    const newBill = {
      id: `bill-${Date.now()}`,
      partyId: party.id,
      projectId: project ? project.id : null,
      billNumber: data.billNumber,
      billDate: data.billDate,
      dueDate: data.dueDate || null,
      totalAmount: total,
      paidAmount: 0,
      outstandingAmount: total,
      status: "POSTED",
      notes: data.notes || "",
      party,
      project,
      lines: data.lines,
      allocations: [],
    };
    g.__DYNAMIC_STORE__.bills.unshift(newBill);
    if (party) {
      party.totalBilled = (party.totalBilled || 0) + total;
      party.outstandingBalance = (party.outstandingBalance || 0) + total;
    }
    g.__DYNAMIC_STORE__.org._count.bills = g.__DYNAMIC_STORE__.bills.length;
    return newBill;
  },
  getPayments(partyId?: string | null) {
    let payments = g.__DYNAMIC_STORE__.payments;
    if (partyId) payments = payments.filter((p: any) => p.partyId === partyId);
    return payments;
  },
  createPayment(data: any) {
    const party = g.__DYNAMIC_STORE__.parties.find((p: any) => p.id === data.partyId) || g.__DYNAMIC_STORE__.parties[0];
    const amountVal = Number(data.amount) || 0;
    const newPayment = {
      id: `pay-${Date.now()}`,
      partyId: party ? party.id : data.partyId,
      paymentNumber: `PAY-${Date.now().toString().slice(-4)}`,
      paymentDate: data.paymentDate || new Date().toISOString(),
      amount: amountVal,
      paymentMode: data.method || data.paymentMode || "BANK_TRANSFER",
      method: data.method || data.paymentMode || "BANK_TRANSFER",
      referenceNumber: data.referenceNumber || `REF-${Date.now().toString().slice(-6)}`,
      notes: data.notes || "",
      status: "POSTED",
      party,
      allocations: data.allocations || [],
    };

    // If bill allocated, apply payment against bill
    if (data.allocations && data.allocations.length > 0) {
      for (const alloc of data.allocations) {
        const targetBill = g.__DYNAMIC_STORE__.bills.find((b: any) => b.id === alloc.billId);
        if (targetBill) {
          targetBill.paidAmount = (targetBill.paidAmount || 0) + alloc.amount;
          targetBill.outstandingAmount = Math.max(0, targetBill.totalAmount - targetBill.paidAmount);
          targetBill.allocations.push({
            id: `ba-${Date.now()}`,
            amount: alloc.amount,
            paymentId: newPayment.id,
          });
        }
      }
    }

    g.__DYNAMIC_STORE__.payments.unshift(newPayment);
    if (party) {
      party.totalPaid = (party.totalPaid || 0) + amountVal;
      party.outstandingBalance = Math.max(0, (party.outstandingBalance || 0) - amountVal);
    }
    return newPayment;
  },
  reversePayment(paymentId: string, reason: string) {
    const pay = g.__DYNAMIC_STORE__.payments.find((p: any) => p.id === paymentId);
    if (pay) {
      pay.status = "REVERSED";
      pay.reverseReason = reason;
      if (pay.party) {
        pay.party.totalPaid -= pay.amount;
        pay.party.outstandingBalance += pay.amount;
      }
    }
    return pay;
  },

  // --- DAILY REPORTS ---
  getDailyReports(filter?: { projectId?: string | null; reportDate?: string | null; siteId?: string | null }) {
    let reports = g.__DYNAMIC_STORE__.dailyReports;
    if (filter?.projectId) reports = reports.filter((r: any) => r.projectId === filter.projectId);
    if (filter?.reportDate) reports = reports.filter((r: any) => r.reportDate === filter.reportDate);
    return reports;
  },
  createDailyReport(data: any) {
    const proj = g.__DYNAMIC_STORE__.projects.find((p: any) => p.id === data.projectId) || initialProjects[0];
    const newReport = {
      id: `dr-${Date.now()}`,
      projectId: data.projectId,
      reportDate: data.reportDate,
      progress: data.progress,
      blockers: data.blockers || "",
      safetyNotes: data.safetyNotes || "",
      weather: "Clear / 30°C",
      workforceCount: 24,
      project: proj,
      creator: { id: "usr-pm-1", name: "Arjun Verma", role: "PROJECT_MANAGER" },
      createdAt: new Date().toISOString(),
    };
    g.__DYNAMIC_STORE__.dailyReports.unshift(newReport);
    return newReport;
  },

  // --- AUDIT & TENANTS ---
  getAuditLogs() {
    return g.__DYNAMIC_STORE__.audit;
  },
  getTenants() {
    return g.__DYNAMIC_STORE__.tenants;
  },
  createTenant(data: any) {
    const newTenant = {
      id: `org-${Date.now()}`,
      name: data.name,
      currency: data.currency || "INR",
      timezone: data.timezone || "Asia/Kolkata",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      _count: { users: 1, sites: 0, projects: 0 },
    };
    g.__DYNAMIC_STORE__.tenants.unshift(newTenant);
    return newTenant;
  },
};
