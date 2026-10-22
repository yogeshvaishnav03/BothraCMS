import { prisma } from "@/lib/db";
import type { UserContext } from "@/lib/auth";
import { notifyPeople } from "@/lib/notify";
import { getUserAccessibleProjectIds, isOrgOwnerOrAdmin, userHasProjectAccess } from "@/lib/server-auth";
import { istDateKey } from "@/lib/ist-date";

/**
 * Machines and tools: owned or hired, where each one is, how many hours it
 * ran, fuel and repairs, and what hire is running up. Amounts in paise.
 */

export class EquipmentError extends Error {
  constructor(message: string, public statusCode = 422, public code = "EQUIPMENT_INVALID") {
    super(message);
  }
}

export const EQUIPMENT_CATEGORIES = ["EARTHMOVING", "LIFTING", "CONCRETE", "SHUTTERING", "POWER", "VEHICLE", "TOOLS", "OTHER"] as const;
export const LOG_KINDS = ["USAGE", "FUEL", "MAINTENANCE", "BREAKDOWN", "MOVE"] as const;

/** Managers of machines: admins, project managers and storekeepers. */
export function canManageEquipment(user: UserContext) {
  return isOrgOwnerOrAdmin(user) || user.role === "PROJECT_MANAGER" || user.role === "STOREKEEPER";
}

/** Hire charge earned by a machine for one usage entry. */
export function hireForEntry(e: { hireRate: number | null; hireRateUnit: string | null; ownership: string }, hours: number | null | undefined) {
  if (e.ownership !== "HIRED" || !e.hireRate) return 0;
  if (e.hireRateUnit === "HOUR") return Math.round(e.hireRate * (hours || 0));
  if (e.hireRateUnit === "DAY") return e.hireRate;
  return 0; // monthly hire is billed by the vendor, not per day
}

export class EquipmentService {
  static async list(user: UserContext) {
    const accessible = await getUserAccessibleProjectIds(user);
    const since = `${istDateKey().slice(0, 7)}-01`;
    const rows = await prisma.equipment.findMany({
      where: { organizationId: user.organizationId },
      include: { logs: { orderBy: [{ logDate: "desc" }, { createdAt: "desc" }], take: 30 } },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    const projectIds = Array.from(new Set(rows.flatMap((r) => [r.currentProjectId, ...r.logs.map((l) => l.projectId)]).filter(Boolean) as string[]));
    const vendorIds = Array.from(new Set(rows.map((r) => r.vendorPartyId).filter(Boolean) as string[]));
    const [projects, vendors] = await Promise.all([
      prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }),
      prisma.party.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true, phone: true } }),
    ]);
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));
    const today = istDateKey();

    // Site staff only see machines on their projects (or not on any project).
    const order: Record<string, number> = { UNDER_REPAIR: 0, IN_USE: 1, AVAILABLE: 2, RETURNED: 3 };
    const visible = (accessible ? rows.filter((r) => !r.currentProjectId || accessible.includes(r.currentProjectId)) : rows).sort(
      (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name)
    );
    const equipment = visible.map((r) => {
      const monthLogs = r.logs.filter((l) => l.logDate >= since);
      return {
        ...r,
        currentProjectName: r.currentProjectId ? projectName.get(r.currentProjectId) || null : null,
        vendor: r.vendorPartyId ? vendorMap.get(r.vendorPartyId) || null : null,
        logs: r.logs.map((l) => ({ ...l, projectName: l.projectId ? projectName.get(l.projectId) || null : null })),
        month: {
          hours: Math.round(monthLogs.reduce((s, l) => s + (l.hours || 0), 0) * 10) / 10,
          fuelLitres: Math.round(monthLogs.reduce((s, l) => s + (l.fuelLitres || 0), 0) * 10) / 10,
          cost: monthLogs.reduce((s, l) => s + l.cost, 0),
          daysUsed: new Set(monthLogs.filter((l) => l.kind === "USAGE").map((l) => l.logDate)).size,
        },
        serviceDue: !!r.nextServiceDue && r.nextServiceDue <= today,
      };
    });
    return {
      equipment,
      canManage: canManageEquipment(user),
      summary: {
        total: equipment.length,
        inUse: equipment.filter((e) => e.status === "IN_USE").length,
        underRepair: equipment.filter((e) => e.status === "UNDER_REPAIR").length,
        hired: equipment.filter((e) => e.ownership === "HIRED" && e.status !== "RETURNED").length,
        serviceDue: equipment.filter((e) => e.serviceDue).length,
        monthCost: equipment.reduce((s, e) => s + e.month.cost, 0),
      },
    };
  }

  static async create(
    user: UserContext,
    input: {
      code: string;
      name: string;
      category: string;
      ownership: "OWNED" | "HIRED";
      vendorPartyId?: string | null;
      hireRate?: number | null;
      hireRateUnit?: "HOUR" | "DAY" | "MONTH" | null;
      currentProjectId?: string | null;
      nextServiceDue?: string | null;
      notes?: string | null;
    }
  ) {
    if (!canManageEquipment(user)) throw new EquipmentError("Only admins, project managers and the store can add machines.", 403, "FORBIDDEN");
    const code = input.code.trim().toUpperCase();
    if (await prisma.equipment.findUnique({ where: { organizationId_code: { organizationId: user.organizationId, code } } })) {
      throw new EquipmentError(`Code ${code} is already used.`, 409, "EQUIPMENT_EXISTS");
    }
    if (input.ownership === "HIRED" && (!input.hireRate || !input.hireRateUnit)) throw new EquipmentError("Enter the hire rate and whether it is per hour, day or month.");
    if (input.vendorPartyId) {
      const vendor = await prisma.party.findFirst({ where: { id: input.vendorPartyId, organizationId: user.organizationId } });
      if (!vendor) throw new EquipmentError("Hire company not found.");
    }
    if (input.currentProjectId && !(await userHasProjectAccess(user, input.currentProjectId))) {
      throw new EquipmentError("You are not on that project's team.", 403, "PROJECT_ACCESS_DENIED");
    }
    const eq = await prisma.equipment.create({
      data: {
        organizationId: user.organizationId,
        code,
        name: input.name.trim(),
        category: input.category,
        ownership: input.ownership,
        vendorPartyId: input.ownership === "HIRED" ? input.vendorPartyId || null : null,
        hireRate: input.ownership === "HIRED" ? input.hireRate || null : null,
        hireRateUnit: input.ownership === "HIRED" ? input.hireRateUnit || null : null,
        currentProjectId: input.currentProjectId || null,
        status: input.currentProjectId ? "IN_USE" : "AVAILABLE",
        nextServiceDue: input.nextServiceDue || null,
        notes: input.notes || null,
      },
    });
    await prisma.auditEvent.create({
      data: { organizationId: user.organizationId, actorUserId: user.userId, action: "EQUIPMENT_ADDED", entityType: "EQUIPMENT", entityId: eq.id, afterJson: JSON.stringify({ code, name: eq.name }) },
    });
    return eq;
  }

  /**
   * A log entry. USAGE adds hire for that day/hours; FUEL and MAINTENANCE carry
   * their own cost; BREAKDOWN marks the machine under repair and alerts the
   * office; MOVE sends it to another project (or back to the yard).
   */
  static async addLog(
    user: UserContext,
    equipmentId: string,
    input: {
      kind: (typeof LOG_KINDS)[number];
      logDate?: string | null;
      projectId?: string | null;
      hours?: number | null;
      fuelLitres?: number | null;
      cost?: number | null;
      operator?: string | null;
      note?: string | null;
      nextServiceDue?: string | null;
    }
  ) {
    const eq = await prisma.equipment.findFirst({ where: { id: equipmentId, organizationId: user.organizationId } });
    if (!eq) throw new EquipmentError("Machine not found", 404, "NOT_FOUND");
    if (eq.status === "RETURNED") throw new EquipmentError("This machine has been returned to the hire company.", 409, "EQUIPMENT_RETURNED");
    const projectId = input.kind === "MOVE" ? input.projectId || null : input.projectId || eq.currentProjectId;
    if (projectId && !(await userHasProjectAccess(user, projectId))) throw new EquipmentError("You are not on that project's team.", 403, "PROJECT_ACCESS_DENIED");
    if (input.kind === "USAGE" && !input.hours) throw new EquipmentError("Enter the hours the machine ran.");
    if (input.kind === "FUEL" && !input.fuelLitres) throw new EquipmentError("Enter the litres of fuel.");
    if (input.kind === "MOVE" && !canManageEquipment(user)) throw new EquipmentError("Only managers can move machines between sites.", 403, "FORBIDDEN");

    const cost = Math.round(input.cost || 0) + (input.kind === "USAGE" ? hireForEntry(eq, input.hours) : 0);
    const statusAfter =
      input.kind === "BREAKDOWN" ? "UNDER_REPAIR" : input.kind === "MAINTENANCE" && eq.status === "UNDER_REPAIR" ? (eq.currentProjectId ? "IN_USE" : "AVAILABLE") : input.kind === "MOVE" ? (projectId ? "IN_USE" : "AVAILABLE") : input.kind === "USAGE" ? "IN_USE" : eq.status;

    const [log] = await prisma.$transaction([
      prisma.equipmentLog.create({
        data: {
          equipmentId: eq.id,
          projectId,
          logDate: input.logDate || istDateKey(),
          kind: input.kind,
          hours: input.hours ?? null,
          fuelLitres: input.fuelLitres ?? null,
          cost,
          operator: input.operator || null,
          note: input.note || null,
          createdBy: user.userId,
        },
      }),
      prisma.equipment.update({
        where: { id: eq.id },
        data: {
          status: statusAfter,
          ...(input.kind === "MOVE" ? { currentProjectId: projectId } : {}),
          ...(input.nextServiceDue !== undefined && input.kind === "MAINTENANCE" ? { nextServiceDue: input.nextServiceDue || null } : {}),
        },
      }),
    ]);

    if (input.kind === "BREAKDOWN") {
      const project = projectId ? await prisma.project.findUnique({ where: { id: projectId }, select: { name: true, managerUserId: true } }) : null;
      await notifyPeople({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        userIds: [project?.managerUserId],
        includeAdmins: true,
        type: "EQUIPMENT_ALERT",
        title: `${eq.name} (${eq.code}) broke down`,
        message: `${project ? `${project.name}: ` : ""}${input.note || "No details given"}`,
        href: `/equipment?id=${eq.id}`,
        entityType: "EQUIPMENT",
        entityId: eq.id,
        severity: "WARNING",
      });
    }
    return log;
  }

  /** Hand a hired machine back. */
  static async returnHired(user: UserContext, equipmentId: string) {
    if (!canManageEquipment(user)) throw new EquipmentError("Only managers can return machines.", 403, "FORBIDDEN");
    const eq = await prisma.equipment.findFirst({ where: { id: equipmentId, organizationId: user.organizationId } });
    if (!eq) throw new EquipmentError("Machine not found", 404, "NOT_FOUND");
    if (eq.ownership !== "HIRED") throw new EquipmentError("Only hired machines are returned.");
    await prisma.equipment.update({ where: { id: eq.id }, data: { status: "RETURNED", currentProjectId: null } });
    await prisma.auditEvent.create({
      data: { organizationId: user.organizationId, actorUserId: user.userId, action: "EQUIPMENT_RETURNED", entityType: "EQUIPMENT", entityId: eq.id, afterJson: JSON.stringify({ code: eq.code }) },
    });
  }
}
