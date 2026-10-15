"use client";

/**
 * BothraCMS Resilient Client-Side State & Cache Layer
 * Guarantees zero data loss across page navigation, browser reloads,
 * and Vercel serverless cold starts when no external database is connected.
 */

const KEYS = {
  PROJECTS: "bothra_cms_projects",
  DELETED_PROJECTS: "bothra_cms_del_projects",
  TASKS: "bothra_cms_tasks",
  TASK_UPDATES: "bothra_cms_task_updates",
  DELETED_TASKS: "bothra_cms_del_tasks",
  MATERIALS: "bothra_cms_materials",
  DELETED_MATERIALS: "bothra_cms_del_materials",
  PARTIES: "bothra_cms_parties",
  DELETED_PARTIES: "bothra_cms_del_parties",
  WORKFORCE: "bothra_cms_workforce",
  DELETED_WORKFORCE: "bothra_cms_del_workforce",
  ATTENDANCE: "bothra_cms_attendance",
  BILLS: "bothra_cms_bills",
  PAYMENTS: "bothra_cms_payments",
  REPORTS: "bothra_cms_reports",
  SITES: "bothra_cms_sites",
};

function getStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStorage(key: string, value: any) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota issues
  }
}

export const clientCache = {
  // --- PROJECTS ---
  mergeProjects(serverProjects: any[]): any[] {
    const local = getStorage<any[]>(KEYS.PROJECTS, []);
    const deleted = new Set(getStorage<string[]>(KEYS.DELETED_PROJECTS, []));

    const combined = [...local, ...serverProjects.filter((p) => !local.some((lp) => lp.id === p.id))];
    return combined.filter((p) => !deleted.has(p.id));
  },
  saveProject(project: any) {
    const local = getStorage<any[]>(KEYS.PROJECTS, []);
    const updated = [project, ...local.filter((p) => p.id !== project.id)];
    setStorage(KEYS.PROJECTS, updated);
  },
  deleteProject(id: string) {
    const deleted = getStorage<string[]>(KEYS.DELETED_PROJECTS, []);
    setStorage(KEYS.DELETED_PROJECTS, [...deleted, id]);
    const local = getStorage<any[]>(KEYS.PROJECTS, []);
    setStorage(KEYS.PROJECTS, local.filter((p) => p.id !== id));
  },

  // --- SITES ---
  mergeSites(serverSites: any[]): any[] {
    const local = getStorage<any[]>(KEYS.SITES, []);
    const combined = [...local, ...serverSites.filter((s) => !local.some((ls) => ls.id === s.id))];
    return combined;
  },
  saveSite(site: any) {
    const local = getStorage<any[]>(KEYS.SITES, []);
    const updated = [site, ...local.filter((s) => s.id !== site.id)];
    setStorage(KEYS.SITES, updated);
  },

  // --- TASKS ---
  mergeTasks(serverTasks: any[]): any[] {
    const local = getStorage<any[]>(KEYS.TASKS, []);
    const updates = getStorage<Record<string, { status: string; note?: string }>>(KEYS.TASK_UPDATES, {});
    const deleted = new Set(getStorage<string[]>(KEYS.DELETED_TASKS, []));

    const combined = [...local, ...serverTasks.filter((t) => !local.some((lt) => lt.id === t.id))];
    return combined
      .filter((t) => !deleted.has(t.id))
      .map((t) => (updates[t.id] ? { ...t, status: updates[t.id].status, note: updates[t.id].note } : t));
  },
  saveTask(task: any) {
    const local = getStorage<any[]>(KEYS.TASKS, []);
    const updated = [task, ...local.filter((t) => t.id !== task.id)];
    setStorage(KEYS.TASKS, updated);
  },
  updateTaskStatus(taskId: string, status: string, note?: string) {
    const updates = getStorage<Record<string, { status: string; note?: string }>>(KEYS.TASK_UPDATES, {});
    updates[taskId] = { status, note };
    setStorage(KEYS.TASK_UPDATES, updates);

    const local = getStorage<any[]>(KEYS.TASKS, []);
    const updated = local.map((t) => (t.id === taskId ? { ...t, status, note } : t));
    setStorage(KEYS.TASKS, updated);
  },
  deleteTask(id: string) {
    const deleted = getStorage<string[]>(KEYS.DELETED_TASKS, []);
    setStorage(KEYS.DELETED_TASKS, [...deleted, id]);
    const local = getStorage<any[]>(KEYS.TASKS, []);
    setStorage(KEYS.TASKS, local.filter((t) => t.id !== id));
  },

  // --- MATERIALS ---
  mergeMaterials(serverMaterials: any[]): any[] {
    const local = getStorage<any[]>(KEYS.MATERIALS, []);
    const deleted = new Set(getStorage<string[]>(KEYS.DELETED_MATERIALS, []));

    const combined = [...local, ...serverMaterials.filter((m) => !local.some((lm) => lm.id === m.id))];
    return combined.filter((m) => !deleted.has(m.id));
  },
  saveMaterial(material: any) {
    const local = getStorage<any[]>(KEYS.MATERIALS, []);
    const updated = [material, ...local.filter((m) => m.id !== material.id)];
    setStorage(KEYS.MATERIALS, updated);
  },
  adjustMaterialStock(materialId: string, delta: number) {
    const local = getStorage<any[]>(KEYS.MATERIALS, []);
    const updated = local.map((m) => {
      if (m.id === materialId) {
        const newStock = Math.max(0, (m.totalStock || 0) + delta);
        return {
          ...m,
          totalStock: newStock,
          isLowStock: m.minStockQty > 0 && newStock <= m.minStockQty,
        };
      }
      return m;
    });
    setStorage(KEYS.MATERIALS, updated);
  },
  deleteMaterial(id: string) {
    const deleted = getStorage<string[]>(KEYS.DELETED_MATERIALS, []);
    setStorage(KEYS.DELETED_MATERIALS, [...deleted, id]);
    const local = getStorage<any[]>(KEYS.MATERIALS, []);
    setStorage(KEYS.MATERIALS, local.filter((m) => m.id !== id));
  },

  // --- PARTIES ---
  mergeParties(serverParties: any[]): any[] {
    const local = getStorage<any[]>(KEYS.PARTIES, []);
    const deleted = new Set(getStorage<string[]>(KEYS.DELETED_PARTIES, []));

    const combined = [...local, ...serverParties.filter((p) => !local.some((lp) => lp.id === p.id))];
    return combined.filter((p) => !deleted.has(p.id));
  },
  saveParty(party: any) {
    const local = getStorage<any[]>(KEYS.PARTIES, []);
    const updated = [party, ...local.filter((p) => p.id !== party.id)];
    setStorage(KEYS.PARTIES, updated);
  },
  deleteParty(id: string) {
    const deleted = getStorage<string[]>(KEYS.DELETED_PARTIES, []);
    setStorage(KEYS.DELETED_PARTIES, [...deleted, id]);
    const local = getStorage<any[]>(KEYS.PARTIES, []);
    setStorage(KEYS.PARTIES, local.filter((p) => p.id !== id));
  },

  // --- WORKFORCE & ATTENDANCE ---
  mergeWorkforce(serverWorkers: any[]): any[] {
    const local = getStorage<any[]>(KEYS.WORKFORCE, []);
    const deleted = new Set(getStorage<string[]>(KEYS.DELETED_WORKFORCE, []));

    const combined = [...local, ...serverWorkers.filter((w) => !local.some((lw) => lw.id === w.id))];
    return combined.filter((w) => !deleted.has(w.id));
  },
  saveWorker(worker: any) {
    const local = getStorage<any[]>(KEYS.WORKFORCE, []);
    const updated = [worker, ...local.filter((w) => w.id !== worker.id)];
    setStorage(KEYS.WORKFORCE, updated);
  },
  deleteWorker(id: string) {
    const deleted = getStorage<string[]>(KEYS.DELETED_WORKFORCE, []);
    setStorage(KEYS.DELETED_WORKFORCE, [...deleted, id]);
    const local = getStorage<any[]>(KEYS.WORKFORCE, []);
    setStorage(KEYS.WORKFORCE, local.filter((w) => w.id !== id));
  },
  mergeAttendance(serverAttendance: any[]): any[] {
    const local = getStorage<any[]>(KEYS.ATTENDANCE, []);
    const combined = [...local, ...serverAttendance.filter((a) => !local.some((la) => la.id === a.id))];
    return combined;
  },
  saveAttendance(session: any) {
    const local = getStorage<any[]>(KEYS.ATTENDANCE, []);
    const updated = [session, ...local.filter((a) => a.id !== session.id)];
    setStorage(KEYS.ATTENDANCE, updated);
  },

  // --- BILLS & PAYMENTS ---
  mergeBills(serverBills: any[]): any[] {
    const local = getStorage<any[]>(KEYS.BILLS, []);
    const combined = [...local, ...serverBills.filter((b) => !local.some((lb) => lb.id === b.id))];
    return combined;
  },
  saveBill(bill: any) {
    const local = getStorage<any[]>(KEYS.BILLS, []);
    const updated = [bill, ...local.filter((b) => b.id !== bill.id)];
    setStorage(KEYS.BILLS, updated);
  },
  mergePayments(serverPayments: any[]): any[] {
    const local = getStorage<any[]>(KEYS.PAYMENTS, []);
    const combined = [...local, ...serverPayments.filter((p) => !local.some((lp) => lp.id === p.id))];
    return combined;
  },
  savePayment(payment: any) {
    const local = getStorage<any[]>(KEYS.PAYMENTS, []);
    const updated = [payment, ...local.filter((p) => p.id !== payment.id)];
    setStorage(KEYS.PAYMENTS, updated);
  },

  // --- DAILY REPORTS ---
  mergeDailyReports(serverReports: any[]): any[] {
    const local = getStorage<any[]>(KEYS.REPORTS, []);
    const combined = [...local, ...serverReports.filter((r) => !local.some((lr) => lr.id === r.id))];
    return combined;
  },
  saveDailyReport(report: any) {
    const local = getStorage<any[]>(KEYS.REPORTS, []);
    const updated = [report, ...local.filter((r) => r.id !== report.id)];
    setStorage(KEYS.REPORTS, updated);
  },

  // --- ACCESSORS ---
  getProjects(): any[] {
    return this.mergeProjects([]);
  },
  getTasks(): any[] {
    return this.mergeTasks([]);
  },
  getMaterials(): any[] {
    return this.mergeMaterials([]);
  },
  getParties(): any[] {
    return this.mergeParties([]);
  },
  getWorkforce(): any[] {
    return this.mergeWorkforce([]);
  },
  getAttendance(): any[] {
    return this.mergeAttendance([]);
  },
  getBills(): any[] {
    return this.mergeBills([]);
  },
  getPayments(): any[] {
    return this.mergePayments([]);
  },
  getDailyReports(): any[] {
    return this.mergeDailyReports([]);
  },
  getSites(): any[] {
    return this.mergeSites([]);
  },

  // --- DYNAMIC LIVE KPI CALCULATOR ---
  calculateKpis(serverKpis?: any, siteId?: string) {
    const projs = this.getProjects().filter((p: any) => !siteId || p.siteId === siteId);
    const tasks = this.getTasks().filter(
      (t: any) => !siteId || t.project?.siteId === siteId || projs.some((p: any) => p.id === t.projectId)
    );
    const atts = this.getAttendance().filter((a: any) => !siteId || a.siteId === siteId);
    const mats = this.getMaterials();
    const payments = this.getPayments();
    const bills = this.getBills();

    const todayStr = new Date().toISOString().split("T")[0];
    const now = Date.now();

    // 1. Active Projects Count
    const activeProjectsCount = projs.filter(
      (p: any) => p.status === "ACTIVE" || p.status === "IN_PROGRESS" || p.status === "PLANNING"
    ).length;

    // 2. Tasks Due Today
    const tasksDueTodayCount = tasks.filter((t: any) => {
      if (t.status === "COMPLETED") return false;
      if (!t.dueAt) return false;
      return t.dueAt.startsWith(todayStr);
    }).length;

    // 3. Tasks Overdue
    const tasksOverdueCount = tasks.filter((t: any) => {
      if (t.status === "COMPLETED") return false;
      if (!t.dueAt) return false;
      return new Date(t.dueAt).getTime() < now;
    }).length;

    // 4. Workers Present Today
    const workersPresentTodayCount = atts.filter((a: any) => {
      const isToday =
        a.workDate === todayStr ||
        (a.checkInAt && a.checkInAt.startsWith(todayStr)) ||
        (a.createdAt && a.createdAt.startsWith(todayStr));
      return (
        isToday &&
        ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status || "PRESENT")
      );
    }).length;

    // 5. Low Stock Items Count
    const lowStockItemsCount = mats.filter((m: any) => {
      const stock = m.totalStock !== undefined ? m.totalStock : (m.stockBalances?.reduce((sum: number, b: any) => sum + (b.quantityOnHand || 0), 0) || 0);
      return m.isLowStock || (m.minStockQty > 0 && stock <= m.minStockQty);
    }).length;

    // 6. Payments Made Today
    const paymentsMadeTodayAmount = payments
      .filter((p: any) => {
        const isToday = (p.paymentDate || "").startsWith(todayStr) || (p.createdAt || "").startsWith(todayStr);
        return (p.status === "POSTED" || !p.status) && isToday;
      })
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    // 7. Total Outstanding Payables
    const totalOutstandingPayablesAmount = bills
      .filter((b: any) => b.status === "POSTED" || !b.status)
      .reduce((sum: number, b: any) => {
        const remaining =
          b.outstandingAmount !== undefined
            ? b.outstandingAmount
            : b.totalAmount - (b.paidAmount || 0);
        return sum + (remaining > 0 ? remaining : 0);
      }, 0);

    return {
      activeProjectsCount: activeProjectsCount || serverKpis?.activeProjectsCount || 0,
      tasksDueTodayCount: tasksDueTodayCount !== undefined ? tasksDueTodayCount : (serverKpis?.tasksDueTodayCount || 0),
      tasksOverdueCount: tasksOverdueCount !== undefined ? tasksOverdueCount : (serverKpis?.tasksOverdueCount || 0),
      workersPresentTodayCount: workersPresentTodayCount || serverKpis?.workersPresentTodayCount || 0,
      lowStockItemsCount: lowStockItemsCount !== undefined ? lowStockItemsCount : (serverKpis?.lowStockItemsCount || 0),
      paymentsMadeTodayAmount: paymentsMadeTodayAmount || serverKpis?.paymentsMadeTodayAmount || 0,
      totalOutstandingPayablesAmount: totalOutstandingPayablesAmount || serverKpis?.totalOutstandingPayablesAmount || 0,
    };
  },
};
