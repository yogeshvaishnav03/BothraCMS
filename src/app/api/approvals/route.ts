import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { resolveDeliveryLocation } from "@/lib/order-notifications";

export const dynamic = "force-dynamic";

const approvalActionSchema = z.object({
  entityType: z.enum(["PAYMENT", "EXPENSE", "MATERIAL_REQUEST", "MEASUREMENT_CHANGE", "PURCHASE_ORDER"]),
  entityId: z.string().min(1),
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);

    const roleStr = user.role as string;
    const isSuperAdmin = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";
    const isAccountant = user.role === "ACCOUNTANT";
    const isProjectManager = user.role === "PROJECT_MANAGER";
    const isApprover = isSuperAdmin || isAccountant || isProjectManager;

    // 1. Pending & Rejected Payments / Expenses
    const paymentWhere: any = {
      organizationId: user.organizationId,
      isArchived: false,
    };

    if (isApprover) {
      paymentWhere.OR = [
        { status: "PENDING_APPROVAL" },
        { status: "REJECTED" },
        { createdBy: user.userId },
      ];
    } else {
      paymentWhere.OR = [
        { createdBy: user.userId },
        { status: "REJECTED" },
      ];
    }

    const [payments, materialRequests, measurementChanges, purchaseOrders] = await Promise.all([
      prisma.payment.findMany({
        where: paymentWhere,
        include: {
          project: { include: { site: true } },
          creator: { select: { id: true, name: true, role: true } },
          party: { select: { id: true, name: true, partyType: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),

      // 2. Material Requests
      prisma.materialRequest.findMany({
        where: {
          organizationId: user.organizationId,
          ...(isSuperAdmin
            ? { OR: [{ status: "PENDING" }, { status: "REJECTED" }, { requestedById: user.userId }] }
            : { OR: [{ requestedById: user.userId }, { status: "REJECTED" }] }),
        },
        include: {
          project: { include: { site: true } },
          requestedBy: { select: { id: true, name: true, role: true } },
          items: { include: { material: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 30,
      }),

      // 3. Measurement Change Requests
      isSuperAdmin || user.role === "PROJECT_MANAGER"
        ? prisma.measurementChangeRequest.findMany({
            where: {
              organizationId: user.organizationId,
              status: "PENDING",
            },
            include: {
              entry: true,
            },
            orderBy: { createdAt: "desc" },
            take: 15,
          })
        : Promise.resolve([]),

      // 4. Purchase Orders awaiting approval / rejected
      prisma.purchaseOrder.findMany({
        where: {
          organizationId: user.organizationId,
          ...(isApprover
            ? { OR: [{ status: "PENDING_APPROVAL" }, { status: "REJECTED" }, { createdBy: user.userId }] }
            : { OR: [{ createdBy: user.userId }, { status: "REJECTED" }] }),
        },
        include: {
          material: true,
          vendor: true,
          store: { include: { site: true } },
          site: true,
          creator: { select: { id: true, name: true, role: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 40,
      }),
    ]);

    const formattedPayments = payments.map((p) => {
      const isOop = p.recipientType === "OUT_OF_POCKET";
      const rejectionNote =
        p.rejectionReason ||
        (p.status === "REJECTED" ? `Declined${p.approvedBy ? ` by ${p.approvedBy}` : " by management"}` : null);
      return {
        id: p.id,
        type: isOop ? "EXPENSE" : "PAYMENT",
        title: isOop ? `Cash Expense: ${p.notes || "Petty Cash"}` : `Payment Request: ${p.recipientName || p.party?.name || "Vendor"}`,
        amountRupees: (p.amount || 0) / 100,
        status: p.status,
        projectName: p.project?.name || "General",
        siteName: p.project?.site?.name || "Site",
        requestedBy: p.creator?.name || "Staff",
        requestedByRole: p.creator?.role || "USER",
        rejectionReason: rejectionNote,
        date: p.paymentDate ? p.paymentDate.toISOString() : p.createdAt.toISOString(),
        query: p.approvalQuery || p.notes || null,
      };
    });

    const formattedMaterialRequests = materialRequests.map((mr) => ({
      id: mr.id,
      type: "MATERIAL_REQUEST",
      title: `Material Order #${mr.requestNumber} (${mr.items.length} items)`,
      amountRupees: 0,
      status: mr.status,
      projectName: mr.project?.name || "General",
      siteName: mr.project?.site?.name || "Site",
      requestedBy: mr.requestedBy?.name || "Worksite Team",
      requestedByRole: mr.requestedBy?.role || "SITE_TEAM",
      rejectionReason: mr.reviewNote || null,
      date: mr.createdAt.toISOString(),
    }));

    const formattedPurchaseOrders = purchaseOrders.map((po) => {
      const deliveryLocation = resolveDeliveryLocation({
        store: po.store,
        site: po.site,
      });
      return {
        id: po.id,
        type: "PURCHASE_ORDER",
        title: `Purchase Order #${po.orderNumber}: ${po.quantity} ${po.unitCode} ${po.material?.name || "Material"} from ${po.vendor?.name || "Vendor"}`,
        amountRupees: (po.totalAmount || 0) / 100,
        status: po.status,
        projectName: po.site?.name || "General",
        siteName: deliveryLocation || po.site?.name || "Site Store",
        requestedBy: po.creator?.name || "Staff",
        requestedByRole: po.creator?.role || "SITE_SUPERVISOR",
        rejectionReason: po.rejectionReason || null,
        date: po.createdAt.toISOString(),
        query: po.approvalQuery || po.notes || null,
      };
    });

    const formattedMeasurementChanges = measurementChanges.map((mc: any) => ({
      id: mc.id,
      type: "MEASUREMENT_CHANGE",
      title: `MB Change Request #${mc.entry?.referenceNumber || mc.id.slice(0, 8)}`,
      amountRupees: 0,
      status: mc.status,
      projectName: "Measurement Book",
      siteName: "Site",
      requestedBy: mc.requestedByName || "Engineer",
      requestedByRole: mc.requestedRole || "SITE_SUPERVISOR",
      rejectionReason: mc.reviewerComments || null,
      date: mc.createdAt.toISOString(),
    }));

    return jsonSuccess({
      isApprover: isSuperAdmin || isAccountant || user.role === "PROJECT_MANAGER",
      items: [
        ...formattedPurchaseOrders,
        ...formattedPayments,
        ...formattedMaterialRequests,
        ...formattedMeasurementChanges,
      ],
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const body = await req.json();
    const data = approvalActionSchema.parse(body);

    const isApprover =
      user.role === "SUPER_ADMIN" ||
      user.role === "ORG_ADMIN" ||
      user.role === "ACCOUNTANT" ||
      user.role === "PROJECT_MANAGER";

    if (!isApprover) {
      return jsonError("Forbidden: You do not have permission to approve/reject requests", 403);
    }

    if (data.entityType === "PAYMENT" || data.entityType === "EXPENSE") {
      const payment = await prisma.payment.findFirst({
        where: { id: data.entityId, organizationId: user.organizationId },
      });

      if (!payment) return jsonError("Payment record not found", "NOT_FOUND", 404);

      const isExecutive = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";

      // 1. Strict Self-Approval Prevention: Submitter cannot approve their own financial transaction
      if (payment.createdBy === user.userId && !isExecutive) {
        return jsonError(
          "Forbidden: Dual-control security policy prohibits self-approval of your own payment or expense submissions",
          "SELF_APPROVAL_FORBIDDEN",
          403
        );
      }

      // 2. High-Value Payment Escalation Threshold: Payments >= ₹5,00,000 require ORG_ADMIN / SUPER_ADMIN
      const HIGH_VALUE_THRESHOLD_PAISE = 50000000; // ₹5,00,000 (5 Lakhs) in paise
      if (data.action === "APPROVE" && (payment.amount || 0) >= HIGH_VALUE_THRESHOLD_PAISE && !isExecutive) {
        const amtStr = Math.round((payment.amount || 0) / 100).toLocaleString("en-IN");
        return jsonError(
          `High-value transaction (₹${amtStr}) exceeds authorization limit of ₹5,00,000. Approval must be escalated to an Executive Administrator (ORG_ADMIN).`,
          "HIGH_VALUE_ESCALATION_REQUIRED",
          403
        );
      }

      await prisma.payment.update({
        where: { id: data.entityId },
        data: {
          status: data.action === "APPROVE" ? "POSTED" : "REJECTED",
          rejectionReason: data.action === "REJECT" ? data.reason || "Rejected by administrator" : null,
          approvedBy: data.action === "APPROVE" ? user.userId : null,
          approvedAt: data.action === "APPROVE" ? new Date() : null,
        },
      });
    } else if (data.entityType === "MATERIAL_REQUEST") {
      const mr = await prisma.materialRequest.findFirst({
        where: { id: data.entityId, organizationId: user.organizationId },
      });
      if (!mr) return jsonError("Material request not found or outside organization scope", 404);

      await prisma.materialRequest.update({
        where: { id: data.entityId },
        data: {
          status: data.action === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewedById: user.userId,
          reviewedAt: new Date(),
          reviewNote: data.reason || (data.action === "APPROVE" ? "Approved" : "Rejected"),
        },
      });
    } else if (data.entityType === "PURCHASE_ORDER") {
      const po = await prisma.purchaseOrder.findFirst({
        where: { id: data.entityId, organizationId: user.organizationId },
      });
      if (!po) return jsonError("Purchase order not found or outside organization scope", 404);

      const now = new Date();
      if (data.action === "APPROVE") {
        await prisma.purchaseOrder.update({
          where: { id: data.entityId },
          data: {
            status: "APPROVED",
            approvedBy: `${user.name} (${user.role})`,
            approvedAt: now,
            notes: data.reason
              ? `${po.notes ? po.notes + "\n" : ""}[Approved by ${user.name}]: ${data.reason}`
              : po.notes,
            notificationSent: true,
            notificationSentAt: now,
          },
        });

        await prisma.auditEvent.create({
          data: {
            organizationId: user.organizationId,
            actorUserId: user.userId,
            action: "PURCHASE_ORDER_APPROVED",
            entityType: "PURCHASE_ORDER",
            entityId: po.id,
            beforeJson: JSON.stringify({ status: po.status }),
            afterJson: JSON.stringify({ status: "APPROVED", approvedBy: user.name }),
          },
        });
      } else {
        await prisma.purchaseOrder.update({
          where: { id: data.entityId },
          data: {
            status: "REJECTED",
            rejectionReason: data.reason || "Rejected by administrator",
            approvedBy: `${user.name} (${user.role})`,
            approvedAt: now,
          },
        });

        await prisma.auditEvent.create({
          data: {
            organizationId: user.organizationId,
            actorUserId: user.userId,
            action: "PURCHASE_ORDER_REJECTED",
            entityType: "PURCHASE_ORDER",
            entityId: po.id,
            beforeJson: JSON.stringify({ status: po.status }),
            afterJson: JSON.stringify({ status: "REJECTED", rejectionReason: data.reason }),
          },
        });
      }
    } else if (data.entityType === "MEASUREMENT_CHANGE") {
      const mc = await prisma.measurementChangeRequest.findFirst({
        where: { id: data.entityId, organizationId: user.organizationId },
      });
      if (!mc) return jsonError("Measurement change request not found or outside organization scope", 404);

      await prisma.measurementChangeRequest.update({
        where: { id: data.entityId },
        data: {
          status: data.action === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewedBy: user.userId,
          reviewedByName: user.name || "Administrator",
          reviewerComments: data.reason || (data.action === "APPROVE" ? "Approved" : "Rejected"),
          reviewedAt: new Date(),
        },
      });
    }

    return jsonSuccess({ message: `Successfully ${data.action.toLowerCase()}d` });
  } catch (error) {
    return handleApiError(error);
  }
}
