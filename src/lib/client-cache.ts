"use client";

/**
 * BothraCMS Authoritative Client Cache & State Layer
 * Phase 7: Dynamic & Server-Authoritative Architecture
 * 
 * In accordance with Phase 7 requirements:
 * 1. Financial records, inventory balances, workforce, attendance, and business data
 *    are NEVER persisted or merged from browser localStorage.
 * 2. Stale business records in local storage are purged to prevent split-brain state.
 * 3. All data queries are authoritative from the PostgreSQL/Prisma persistent database.
 * 4. LocalStorage is strictly reserved for harmless UI preferences (e.g. active site filter).
 */

// Legacy business keys that must be cleared from user browser storage
const LEGACY_STORAGE_KEYS = [
  "bothra_cms_projects",
  "bothra_cms_del_projects",
  "bothra_cms_tasks",
  "bothra_cms_task_updates",
  "bothra_cms_del_tasks",
  "bothra_cms_materials",
  "bothra_cms_del_materials",
  "bothra_cms_parties",
  "bothra_cms_del_parties",
  "bothra_cms_workforce",
  "bothra_cms_del_workforce",
  "bothra_cms_attendance",
  "bothra_cms_bills",
  "bothra_cms_payments",
  "bothra_cms_reports",
  "bothra_cms_sites",
  "bothra_org_name",
];

export function clearLegacyBusinessLocalStorage(): void {
  if (typeof window !== "undefined") {
    try {
      for (const key of LEGACY_STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }
}

// Purge legacy business data from client storage immediately upon module load
clearLegacyBusinessLocalStorage();

export const clientCache = {
  // --- AUTHORITATIVE PASSTHROUGH (No localStorage merging of business records) ---
  mergeProjects(serverProjects: any[]): any[] {
    return Array.isArray(serverProjects) ? serverProjects : [];
  },
  saveProject(_project: any): void {
    // No-op: Business data is persisted authoritatively via database API
  },
  deleteProject(_id: string): void {
    // No-op: Deletions are processed and verified via database API
  },

  mergeSites(serverSites: any[]): any[] {
    return Array.isArray(serverSites) ? serverSites : [];
  },
  saveSite(_site: any): void {
    // No-op
  },

  mergeTasks(serverTasks: any[]): any[] {
    return Array.isArray(serverTasks) ? serverTasks : [];
  },
  saveTask(_task: any): void {
    // No-op
  },
  updateTaskStatus(_taskId: string, _status: string, _note?: string): void {
    // No-op
  },
  deleteTask(_id: string): void {
    // No-op
  },

  mergeMaterials(serverMaterials: any[]): any[] {
    return Array.isArray(serverMaterials) ? serverMaterials : [];
  },
  saveMaterial(_material: any): void {
    // No-op
  },
  adjustMaterialStock(_materialId: string, _delta: number): void {
    // No-op: Stock is authoritatively computed from ledger movements in the database
  },
  deleteMaterial(_id: string): void {
    // No-op
  },

  mergeParties(serverParties: any[]): any[] {
    return Array.isArray(serverParties) ? serverParties : [];
  },
  saveParty(_party: any): void {
    // No-op
  },
  deleteParty(_id: string): void {
    // No-op
  },

  mergeWorkforce(serverWorkers: any[]): any[] {
    return Array.isArray(serverWorkers) ? serverWorkers : [];
  },
  saveWorker(_worker: any): void {
    // No-op
  },
  deleteWorker(_id: string): void {
    // No-op
  },

  mergeAttendance(serverAttendance: any[]): any[] {
    return Array.isArray(serverAttendance) ? serverAttendance : [];
  },
  saveAttendance(_session: any): void {
    // No-op
  },

  mergeBills(serverBills: any[]): any[] {
    return Array.isArray(serverBills) ? serverBills : [];
  },
  saveBill(_bill: any): void {
    // No-op
  },

  mergePayments(serverPayments: any[]): any[] {
    return Array.isArray(serverPayments) ? serverPayments : [];
  },
  savePayment(_payment: any): void {
    // No-op
  },

  mergeDailyReports(serverReports: any[]): any[] {
    return Array.isArray(serverReports) ? serverReports : [];
  },
  saveDailyReport(_report: any): void {
    // No-op
  },

  // Authoritative empty accessors (components must load data from API routes)
  getProjects(): any[] {
    return [];
  },
  getTasks(): any[] {
    return [];
  },
  getMaterials(): any[] {
    return [];
  },
  getParties(): any[] {
    return [];
  },
  getWorkforce(): any[] {
    return [];
  },
  getAttendance(): any[] {
    return [];
  },
  getBills(): any[] {
    return [];
  },
  getPayments(): any[] {
    return [];
  },
  getDailyReports(): any[] {
    return [];
  },
  getSites(): any[] {
    return [];
  },

  // --- AUTHORITATIVE KPI RESOLVER ---
  calculateKpis(serverKpis?: any, _siteId?: string) {
    const base: any = {
      activeProjectsCount: serverKpis?.activeProjectsCount ?? 0,
      tasksDueTodayCount: serverKpis?.tasksDueTodayCount ?? 0,
      tasksOverdueCount: serverKpis?.tasksOverdueCount ?? 0,
      workersPresentTodayCount: serverKpis?.workersPresentTodayCount ?? 0,
      lowStockItemsCount: serverKpis?.lowStockItemsCount ?? 0,
      paymentsMadeTodayAmount: serverKpis?.paymentsMadeTodayAmount ?? 0,
      totalOutstandingPayablesAmount: serverKpis?.totalOutstandingPayablesAmount ?? 0,
    };

    if (serverKpis?.workforceCount !== undefined) base.workforceCount = serverKpis.workforceCount;
    if (serverKpis?.staffAttendanceCount !== undefined) base.staffAttendanceCount = serverKpis.staffAttendanceCount;
    if (serverKpis?.totalOnSiteCount !== undefined) base.totalOnSiteCount = serverKpis.totalOnSiteCount;
    if (serverKpis?.workforceHeadcount !== undefined) base.workforceHeadcount = serverKpis.workforceHeadcount;

    if (
      serverKpis?.activeProjects !== undefined ||
      serverKpis?.tasksDueToday !== undefined ||
      serverKpis?.tasksOverdue !== undefined ||
      serverKpis?.workersPresentToday !== undefined ||
      serverKpis?.lowStockItems !== undefined ||
      serverKpis?.paymentsMadeToday !== undefined ||
      serverKpis?.outstandingPayables !== undefined ||
      serverKpis?.workforceHeadcount !== undefined
    ) {
      base.activeProjects = serverKpis?.activeProjects ?? [];
      base.tasksDueToday = serverKpis?.tasksDueToday ?? [];
      base.tasksOverdue = serverKpis?.tasksOverdue ?? [];
      base.workersPresentToday = serverKpis?.workersPresentToday ?? [];
      base.workforceHeadcount = serverKpis?.workforceHeadcount ?? null;
      base.lowStockItems = serverKpis?.lowStockItems ?? [];
      base.paymentsMadeToday = serverKpis?.paymentsMadeToday ?? [];
      base.outstandingPayables = serverKpis?.outstandingPayables ?? [];
    }

    return base;
  },
};
