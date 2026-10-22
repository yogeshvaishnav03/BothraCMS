import { prisma } from "@/lib/db";
import type { UserContext } from "@/lib/auth";
import { notifyPeople } from "@/lib/notify";
import { getUserAccessibleProjectIds, isOrgOwnerOrAdmin, userHasProjectAccess } from "@/lib/server-auth";
import { istDateKey } from "@/lib/ist-date";

/**
 * Site asks for material → office approves (and can cut quantities) →
 * each approved line becomes a purchase order with a vendor and rate.
 */

export class MaterialRequestError extends Error {
  constructor(message: string, public statusCode = 422, public code = "MATERIAL_REQUEST_INVALID") {
    super(message);
  }
}

export interface RequestItemInput {
  materialId?: string | null;
  description?: string | null;
  quantity: number;
  unitCode?: string | null;
}

const requestInclude = {
  project: { select: { id: true, name: true, code: true, siteId: true, managerUserId: true, site: { select: { name: true } } } },
  requestedBy: { select: { id: true, name: true, role: true, phone: true } },
  reviewedBy: { select: { id: true, name: true } },
  items: {
    include: {
      material: { select: { id: true, name: true, sku: true, unitCode: true } },
      purchaseOrder: { select: { id: true, orderNumber: true, status: true, totalAmount: true, vendor: { select: { id: true, name: true } } } },
    },
  },
} as const;

/** Who can approve requests and turn them into orders. */
export async function canManageRequest(user: UserContext, projectId: string): Promise<boolean> {
  if (isOrgOwnerOrAdmin(user)) return true;
  if (user.role !== "PROJECT_MANAGER" && user.role !== "STOREKEEPER") return false;
  return userHasProjectAccess(user, projectId);
}

async function nextRequestNumber(organizationId: string): Promise<string> {
  const prefix = `MR-${istDateKey().slice(2, 7).replace("-", "")}-`;
  const count = await prisma.materialRequest.count({ where: { organizationId, requestNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

/** Stock on hand of each material across the stores at the project's site. */
async function stockAtSite(siteId: string, materialIds: string[]) {
  if (materialIds.length === 0) return new Map<string, number>();
  const balances = await prisma.stockBalance.findMany({
    where: { materialId: { in: materialIds }, store: { siteId, isArchived: false } },
    select: { materialId: true, quantityOnHand: true },
  });
  const out = new Map<string, number>();
  balances.forEach((b) => out.set(b.materialId, (out.get(b.materialId) || 0) + b.quantityOnHand));
  return out;
}

function nextStatus(items: { approvedQty: number | null; purchaseOrderId: string | null }[]): string {
  const live = items.filter((i) => (i.approvedQty ?? 0) > 0);
  const ordered = live.filter((i) => i.purchaseOrderId).length;
  if (live.length > 0 && ordered === live.length) return "ORDERED";
  if (ordered > 0) return "PARTLY_ORDERED";
  return "APPROVED";
}

export class MaterialRequestService {
  static async create(
    user: UserContext,
    input: { projectId: string; neededBy?: Date | null; priority?: "NORMAL" | "URGENT"; notes?: string | null; items: RequestItemInput[] }
  ) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, organizationId: user.organizationId, isArchived: false },
      select: { id: true, name: true, managerUserId: true },
    });
    if (!project) throw new MaterialRequestError("Project not found", 404, "NOT_FOUND");
    if (!(await userHasProjectAccess(user, project.id))) {
      throw new MaterialRequestError("You are not on this project's team.", 403, "PROJECT_ACCESS_DENIED");
    }
    if (input.items.length === 0) throw new MaterialRequestError("Add at least one material.");

    const materialIds = input.items.map((i) => i.materialId).filter((x): x is string => !!x);
    const materials = await prisma.material.findMany({
      where: { organizationId: user.organizationId, id: { in: materialIds } },
      select: { id: true, name: true, unitCode: true },
    });
    const byId = new Map(materials.map((m) => [m.id, m]));
    const items = input.items.map((i) => {
      const material = i.materialId ? byId.get(i.materialId) : null;
      if (i.materialId && !material) throw new MaterialRequestError("A material on the list was not found", 404, "NOT_FOUND");
      const description = material?.name || i.description?.trim();
      if (!description) throw new MaterialRequestError("Each line needs a material or a description.");
      if (!(i.quantity > 0)) throw new MaterialRequestError(`Quantity for ${description} must be more than zero.`);
      return {
        materialId: material?.id || null,
        description,
        quantity: i.quantity,
        unitCode: material?.unitCode || i.unitCode?.trim() || "NOS",
      };
    });

    let request = null;
    for (let attempt = 0; attempt < 3 && !request; attempt++) {
      try {
        request = await prisma.materialRequest.create({
          data: {
            organizationId: user.organizationId,
            requestNumber: await nextRequestNumber(user.organizationId),
            projectId: project.id,
            requestedById: user.userId,
            neededBy: input.neededBy || null,
            priority: input.priority || "NORMAL",
            notes: input.notes?.trim() || null,
            items: { create: items },
          },
          include: requestInclude,
        });
      } catch (e: any) {
        if (e?.code !== "P2002" || attempt === 2) throw e;
      }
    }

    await notifyPeople({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      userIds: [project.managerUserId],
      includeAdmins: true,
      type: "MATERIAL_REQUEST",
      title: `${input.priority === "URGENT" ? "URGENT: " : ""}${user.name} needs material for ${project.name}`,
      message: items.map((i) => `${i.quantity} ${i.unitCode} ${i.description}`).join(", "),
      severity: input.priority === "URGENT" ? "WARNING" : "INFO",
      entityType: "MATERIAL_REQUEST",
      entityId: request!.id,
      href: `/material-requests?id=${request!.id}`,
    });

    return request!;
  }

  static async list(user: UserContext, filters: { status?: string | null; projectId?: string | null }) {
    const accessible = await getUserAccessibleProjectIds(user);
    const where: any = { organizationId: user.organizationId };
    if (accessible) where.OR = [{ projectId: { in: accessible } }, { requestedById: user.userId }];
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.status) where.status = { in: filters.status.split(",") };

    const requests = await prisma.materialRequest.findMany({
      where,
      include: requestInclude,
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    });

    // Stock already at the site, so the approver can see if an order is needed at all.
    const bySite = new Map<string, Set<string>>();
    requests.forEach((r) =>
      r.items.forEach((i) => i.materialId && bySite.set(r.project.siteId, (bySite.get(r.project.siteId) || new Set()).add(i.materialId)))
    );
    const stock = new Map<string, Map<string, number>>();
    for (const [siteId, ids] of Array.from(bySite.entries())) stock.set(siteId, await stockAtSite(siteId, Array.from(ids)));

    const manageable = new Map<string, boolean>();
    for (const pid of Array.from(new Set(requests.map((r) => r.projectId)))) manageable.set(pid, await canManageRequest(user, pid));

    return requests.map((r) => ({
      ...r,
      canManage: manageable.get(r.projectId) || false,
      items: r.items.map((i) => ({ ...i, stockAtSite: i.materialId ? stock.get(r.project.siteId)?.get(i.materialId) ?? 0 : null })),
    }));
  }

  static async review(
    user: UserContext,
    requestId: string,
    input: { action: "APPROVE" | "REJECT"; note?: string | null; items?: { id: string; approvedQty: number }[] }
  ) {
    const request = await prisma.materialRequest.findFirst({
      where: { id: requestId, organizationId: user.organizationId },
      include: { items: true, project: { select: { id: true, name: true } } },
    });
    if (!request) throw new MaterialRequestError("Request not found", 404, "NOT_FOUND");
    if (!(await canManageRequest(user, request.projectId))) {
      throw new MaterialRequestError("Only admins, the project manager or the storekeeper can approve requests.", 403, "FORBIDDEN");
    }
    if (request.status !== "PENDING") throw new MaterialRequestError("This request has already been dealt with.", 409, "ALREADY_REVIEWED");

    const approvedBy = new Map((input.items || []).map((i) => [i.id, i.approvedQty]));
    const ops: any[] = [];
    if (input.action === "APPROVE") {
      for (const item of request.items) {
        const qty = approvedBy.has(item.id) ? Math.max(0, approvedBy.get(item.id)!) : item.quantity;
        ops.push(prisma.materialRequestItem.update({ where: { id: item.id }, data: { approvedQty: qty } }));
      }
      if (request.items.every((i) => (approvedBy.has(i.id) ? approvedBy.get(i.id)! : i.quantity) <= 0)) {
        throw new MaterialRequestError("Approve at least one line, or reject the request.");
      }
    } else if (!input.note?.trim()) {
      throw new MaterialRequestError("Say why the request is rejected.");
    }
    ops.push(
      prisma.materialRequest.update({
        where: { id: request.id },
        data: {
          status: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewedById: user.userId,
          reviewedAt: new Date(),
          reviewNote: input.note?.trim() || null,
        },
      })
    );
    await prisma.$transaction(ops);

    await notifyPeople({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      userIds: [request.requestedById],
      type: "MATERIAL_REQUEST",
      title: `${request.requestNumber} ${input.action === "APPROVE" ? "approved" : "rejected"} by ${user.name}`,
      message: input.note?.trim() || (input.action === "APPROVE" ? "Purchase orders will follow." : "Request rejected."),
      severity: input.action === "REJECT" ? "WARNING" : "INFO",
      entityType: "MATERIAL_REQUEST",
      entityId: request.id,
      href: `/material-requests?id=${request.id}`,
    });

    return prisma.materialRequest.findUnique({ where: { id: request.id }, include: requestInclude });
  }

  /** Turn one approved line into a purchase order. It follows the normal order approval rules. */
  static async orderItem(
    user: UserContext,
    requestId: string,
    itemId: string,
    input: { vendorPartyId: string; unitRate?: number | null; materialId?: string | null; expectedDeliveryDate?: Date | null }
  ) {
    const request = await prisma.materialRequest.findFirst({
      where: { id: requestId, organizationId: user.organizationId },
      include: { items: true, project: { select: { id: true, name: true, siteId: true } } },
    });
    if (!request) throw new MaterialRequestError("Request not found", 404, "NOT_FOUND");
    if (!(await canManageRequest(user, request.projectId))) {
      throw new MaterialRequestError("Only admins, the project manager or the storekeeper can place orders.", 403, "FORBIDDEN");
    }
    if (!["APPROVED", "PARTLY_ORDERED"].includes(request.status)) {
      throw new MaterialRequestError("Approve the request before ordering.", 409, "NOT_APPROVED");
    }
    const item = request.items.find((i) => i.id === itemId);
    if (!item) throw new MaterialRequestError("Line not found", 404, "NOT_FOUND");
    if (item.purchaseOrderId) throw new MaterialRequestError("This line is already ordered.", 409, "ALREADY_ORDERED");
    const qty = item.approvedQty ?? item.quantity;
    if (qty <= 0) throw new MaterialRequestError("This line was not approved.", 409, "NOT_APPROVED");

    // A free-text line has to be matched to a catalogue material before it can be ordered.
    const materialId = item.materialId || input.materialId;
    if (!materialId) throw new MaterialRequestError("Pick the catalogue material for this line first.");
    const [material, vendor] = await Promise.all([
      prisma.material.findFirst({ where: { id: materialId, organizationId: user.organizationId } }),
      prisma.party.findFirst({ where: { id: input.vendorPartyId, organizationId: user.organizationId, isArchived: false } }),
    ]);
    if (!material) throw new MaterialRequestError("Material not found", 404, "NOT_FOUND");
    if (!vendor) throw new MaterialRequestError("Vendor not found", 404, "NOT_FOUND");

    const unitRatePaise = input.unitRate && input.unitRate > 0 ? Math.round(input.unitRate * 100) : null;
    const totalAmount = unitRatePaise ? Math.round(qty * unitRatePaise) : null;
    const now = new Date();
    const autoApprove = user.role === "SUPER_ADMIN";
    const orderNumber = `PO-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

    const order = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          organizationId: user.organizationId,
          orderNumber,
          materialId: material.id,
          vendorPartyId: vendor.id,
          siteId: request.project.siteId,
          projectId: request.projectId,
          quantity: qty,
          unitCode: material.unitCode,
          unitRate: unitRatePaise,
          totalAmount,
          status: autoApprove ? "APPROVED" : "PENDING_APPROVAL",
          approvalQuery: `From ${request.requestNumber} for ${request.project.name}, raised by ${user.name}`,
          approvedBy: autoApprove ? `${user.name} (${user.role})` : null,
          approvedAt: autoApprove ? now : null,
          expectedDeliveryDate: input.expectedDeliveryDate || request.neededBy || null,
          notes: `Material request ${request.requestNumber}`,
          createdBy: user.userId,
        },
      });
      await tx.materialRequestItem.update({ where: { id: item.id }, data: { purchaseOrderId: po.id, materialId: material.id } });
      const items = await tx.materialRequestItem.findMany({ where: { requestId: request.id } });
      await tx.materialRequest.update({ where: { id: request.id }, data: { status: nextStatus(items) } });
      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: autoApprove ? "PURCHASE_ORDER_APPROVED" : "PURCHASE_ORDER_QUERY_RAISED",
          entityType: "PURCHASE_ORDER",
          entityId: po.id,
          afterJson: JSON.stringify({ orderNumber, material: material.name, quantity: qty, vendor: vendor.name, totalAmount, requestNumber: request.requestNumber }),
          reason: `Purchase order ${orderNumber} raised from material request ${request.requestNumber}`,
        },
      });
      return po;
    });

    await notifyPeople({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      userIds: [request.requestedById],
      type: "MATERIAL_REQUEST",
      title: `${material.name} ordered from ${vendor.name}`,
      message: `${qty} ${material.unitCode} for ${request.requestNumber} (${order.orderNumber}${autoApprove ? "" : ", awaiting order approval"}).`,
      entityType: "MATERIAL_REQUEST",
      entityId: request.id,
      href: `/material-requests?id=${request.id}`,
    });

    return prisma.materialRequest.findUnique({ where: { id: request.id }, include: requestInclude });
  }

  static async cancel(user: UserContext, requestId: string) {
    const request = await prisma.materialRequest.findFirst({ where: { id: requestId, organizationId: user.organizationId } });
    if (!request) throw new MaterialRequestError("Request not found", 404, "NOT_FOUND");
    if (request.requestedById !== user.userId && !isOrgOwnerOrAdmin(user)) {
      throw new MaterialRequestError("Only the person who raised it can cancel this request.", 403, "FORBIDDEN");
    }
    if (request.status !== "PENDING") throw new MaterialRequestError("Only a request that is still waiting can be cancelled.", 409, "ALREADY_REVIEWED");
    return prisma.materialRequest.update({ where: { id: request.id }, data: { status: "CANCELLED" }, include: requestInclude });
  }

  static async pendingCount(organizationId: string) {
    return prisma.materialRequest.count({ where: { organizationId, status: "PENDING" } });
  }
}
