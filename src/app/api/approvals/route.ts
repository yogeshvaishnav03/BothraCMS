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
  action: z.enum(["APPROVE", "REJECT", "RESUBMIT", "RE_REQUEST"]),
  reason: z.string().optional(),
  amountRupees: z.number().positive().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);

    const roleStr = user.role as string;
    const isSuperAdmin = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";
    const isAccountant = user.role === "ACCOUNTANT";
    const isProjectManager = user.role === "PROJECT_MANAGER";
    const isSupervisor = user.role === "SITE_SUPERVISOR" || (user.name && user.name.toLowerCase().includes("ranjan"));
    const isApprover = isSuperAdmin || isAccountant || isProjectManager || isSupervisor;

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

    const mrWhere: any = {
      organizationId: user.organizationId,
      ...(isApprover
        ? { OR: [{ status: "PENDING" }, { status: "REJECTED" }, { requestedById: user.userId }] }
        : { OR: [{ requestedById: user.userId }, { status: "REJECTED" }] }),
    };

    const [payments, materialRequests, measurementChanges, purchaseOrders] = await Promise.all([
      prisma.payment.findMany({
        where: paymentWhere,
        include: {
          project: { include: { site: true } },
          creator: { select: { id: true, name: true, role: true, email: true } },
          party: { select: { id: true, name: true, partyType: true, phone: true } },
          attachments: {
            where: { isArchived: false },
            select: {
              id: true,
              fileId: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
              category: true,
            },
          },
          allocations: {
            include: {
              bill: {
                select: {
                  id: true,
                  billNumber: true,
                  billDate: true,
                  totalAmount: true,
                  costHead: true,
                },
              },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),

      // 2. Material Requests
      prisma.materialRequest.findMany({
        where: mrWhere,
        include: {
          project: { include: { site: true } },
          requestedBy: { select: { id: true, name: true, role: true, email: true } },
          reviewedBy: { select: { id: true, name: true, role: true } },
          items: {
            include: {
              material: { select: { id: true, name: true, sku: true, unitCode: true } },
              purchaseOrder: { select: { id: true, orderNumber: true, status: true } },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 30,
      }),

      // 3. Measurement Change Requests
      isSuperAdmin || user.role === "PROJECT_MANAGER" || isSupervisor
        ? prisma.measurementChangeRequest.findMany({
            where: {
              organizationId: user.organizationId,
              status: "PENDING",
            },
            include: {
              entry: {
                include: {
                  project: { include: { site: true } },
                  party: true,
                },
              },
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
          vendor: { select: { id: true, name: true, phone: true, partyType: true } },
          store: { include: { site: true } },
          site: true,
          project: true,
          creator: { select: { id: true, name: true, role: true, email: true } },
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

      const details = {
        referenceNumber: p.referenceNumber,
        recipientName: p.recipientName || p.party?.name || (isOop ? "Petty Cash / Staff Out-of-Pocket" : "Vendor"),
        recipientType: p.recipientType || (isOop ? "OUT_OF_POCKET" : "VENDOR"),
        partyType: p.party?.partyType || p.recipientType || undefined,
        partyPhone: p.party?.phone || null,
        amountRupees: (p.amount || 0) / 100,
        currency: p.currency || "INR",
        paymentDate: p.paymentDate ? p.paymentDate.toISOString() : p.createdAt.toISOString(),
        createdAt: p.createdAt.toISOString(),
        method: p.method,
        payingAccount: p.payingAccount || null,
        costHead: p.costHead || null,
        notes: p.notes || null,
        approvalQuery: p.approvalQuery || null,
        rejectionReason: rejectionNote,
        approvedBy: p.approvedBy || null,
        approvedAt: p.approvedAt ? p.approvedAt.toISOString() : null,
        creatorName: p.creator?.name || "Staff",
        creatorRole: p.creator?.role || "USER",
        creatorEmail: p.creator?.email || undefined,
        projectName: p.project?.name || "General",
        projectCode: p.project?.code || undefined,
        siteName: p.project?.site?.name || "Site",
        attachments: (p.attachments || []).map((a) => ({
          id: a.id,
          fileId: a.fileId,
          fileName: a.fileName,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          category: a.category,
          url: `/api/uploads/${a.fileId}`,
        })),
        bills: (p.allocations || []).map((al) => ({
          id: al.bill?.id,
          billNumber: al.bill?.billNumber,
          billDate: al.bill?.billDate ? al.bill.billDate.toISOString() : null,
          totalRupees: (al.bill?.totalAmount || 0) / 100,
          allocatedRupees: (al.amount || 0) / 100,
          costHead: al.bill?.costHead || null,
        })),
      };

      return {
        id: p.id,
        type: isOop ? ("EXPENSE" as const) : ("PAYMENT" as const),
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
        details,
      };
    });

    const formattedMaterialRequests = materialRequests.map((mr) => {
      const details = {
        requestNumber: mr.requestNumber,
        priority: mr.priority,
        neededBy: mr.neededBy ? mr.neededBy.toISOString() : null,
        notes: mr.notes || null,
        status: mr.status,
        createdAt: mr.createdAt.toISOString(),
        projectName: mr.project?.name || "General",
        projectCode: mr.project?.code || undefined,
        siteName: mr.project?.site?.name || "Site",
        requestedBy: mr.requestedBy?.name || "Worksite Team",
        requestedByRole: mr.requestedBy?.role || "SITE_TEAM",
        creatorName: mr.requestedBy?.name || "Worksite Team",
        creatorRole: mr.requestedBy?.role || "SITE_TEAM",
        creatorEmail: mr.requestedBy?.email || undefined,
        reviewedBy: mr.reviewedBy?.name || null,
        reviewedAt: mr.reviewedAt ? mr.reviewedAt.toISOString() : null,
        reviewNote: mr.reviewNote || null,
        rejectionReason: mr.status === "REJECTED" ? mr.reviewNote : null,
        items: mr.items.map((it) => ({
          id: it.id,
          description: it.material?.name || it.description,
          sku: it.material?.sku || null,
          quantity: it.quantity,
          approvedQty: it.approvedQty ?? null,
          unitCode: it.unitCode || it.material?.unitCode || "units",
          purchaseOrderNumber: it.purchaseOrder?.orderNumber || null,
        })),
      };

      return {
        id: mr.id,
        type: "MATERIAL_REQUEST" as const,
        title: `Material Order #${mr.requestNumber} (${mr.items.length} items)`,
        amountRupees: 0,
        status: mr.status,
        projectName: mr.project?.name || "General",
        siteName: mr.project?.site?.name || "Site",
        requestedBy: mr.requestedBy?.name || "Worksite Team",
        requestedByRole: mr.requestedBy?.role || "SITE_TEAM",
        rejectionReason: mr.reviewNote || null,
        date: mr.createdAt.toISOString(),
        query: mr.notes || null,
        details,
      };
    });

    const formattedPurchaseOrders = purchaseOrders.map((po) => {
      const deliveryLocation = resolveDeliveryLocation({
        store: po.store,
        site: po.site,
      });

      const details = {
        orderNumber: po.orderNumber,
        materialName: po.material?.name,
        materialSku: po.material?.sku || null,
        vendorName: po.vendor?.name,
        vendorPhone: po.vendor?.phone || null,
        vendorType: po.vendor?.partyType || "VENDOR",
        quantity: po.quantity,
        unitCode: po.unitCode,
        unitRateRupees: po.unitRate ? po.unitRate / 100 : null,
        totalAmountRupees: (po.totalAmount || 0) / 100,
        status: po.status,
        deliveryLocation: deliveryLocation || po.site?.name || "Site Store",
        expectedDeliveryDate: po.expectedDeliveryDate ? po.expectedDeliveryDate.toISOString() : null,
        notes: po.notes || null,
        approvalQuery: po.approvalQuery || null,
        rejectionReason: po.rejectionReason || null,
        approvedBy: po.approvedBy || null,
        approvedAt: po.approvedAt ? po.approvedAt.toISOString() : null,
        createdAt: po.createdAt.toISOString(),
        creatorName: po.creator?.name || "Staff",
        creatorRole: po.creator?.role || "SITE_SUPERVISOR",
        creatorEmail: po.creator?.email || undefined,
        projectName: po.project?.name || po.site?.name || "General",
        siteName: deliveryLocation || po.site?.name || "Site Store",
      };

      return {
        id: po.id,
        type: "PURCHASE_ORDER" as const,
        title: `Purchase Order #${po.orderNumber}: ${po.quantity} ${po.unitCode} ${po.material?.name || "Material"} from ${po.vendor?.name || "Vendor"}`,
        amountRupees: (po.totalAmount || 0) / 100,
        status: po.status,
        projectName: po.project?.name || po.site?.name || "General",
        siteName: deliveryLocation || po.site?.name || "Site Store",
        requestedBy: po.creator?.name || "Staff",
        requestedByRole: po.creator?.role || "SITE_SUPERVISOR",
        rejectionReason: po.rejectionReason || null,
        date: po.createdAt.toISOString(),
        query: po.approvalQuery || po.notes || null,
        details,
      };
    });

    const safeParse = (str: string | null | undefined) => {
      if (!str) return null;
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
    };

    const formattedMeasurementChanges = measurementChanges.map((mc: any) => {
      const prev = safeParse(mc.previousData);
      const prop = safeParse(mc.proposedData);

      const details = {
        referenceNumber: mc.entry?.referenceNumber || mc.id.slice(0, 8),
        requestType: mc.requestType,
        reason: mc.reason,
        status: mc.status,
        createdAt: mc.createdAt.toISOString(),
        requestedByName: mc.requestedByName || "Engineer",
        requestedRole: mc.requestedRole || "SITE_SUPERVISOR",
        creatorName: mc.requestedByName || "Engineer",
        creatorRole: mc.requestedRole || "SITE_SUPERVISOR",
        reviewedByName: mc.reviewedByName || null,
        reviewerComments: mc.reviewerComments || null,
        reviewedAt: mc.reviewedAt ? mc.reviewedAt.toISOString() : null,
        rejectionReason: mc.reviewerComments || null,
        projectName: mc.entry?.project?.name || "Measurement Book",
        siteName: mc.entry?.project?.site?.name || "Site",
        contractorName: mc.entry?.party?.name || null,
        entryName: mc.entry?.entryName || null,
        itemDescription: mc.entry?.itemDescription || null,
        measurementUnit: mc.entry?.unit || null,
        measurementQty: mc.entry?.quantity || 0,
        measurementRate: mc.entry?.unitRate ? mc.entry.unitRate / 100 : 0,
        measurementTotal: mc.entry?.totalAmount ? mc.entry.totalAmount / 100 : 0,
        previousData: prev,
        proposedData: prop,
      };

      return {
        id: mc.id,
        type: "MEASUREMENT_CHANGE" as const,
        title: `MB Change Request #${mc.entry?.referenceNumber || mc.id.slice(0, 8)}`,
        amountRupees: 0,
        status: mc.status,
        projectName: "Measurement Book",
        siteName: "Site",
        requestedBy: mc.requestedByName || "Engineer",
        requestedByRole: mc.requestedRole || "SITE_SUPERVISOR",
        rejectionReason: mc.reviewerComments || null,
        date: mc.createdAt.toISOString(),
        query: mc.reason || null,
        details,
      };
    });

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

    const isReRequest = data.action === "RESUBMIT" || data.action === "RE_REQUEST";

    const isApprover =
      user.role === "SUPER_ADMIN" ||
      user.role === "ORG_ADMIN" ||
      user.role === "ACCOUNTANT" ||
      user.role === "PROJECT_MANAGER" ||
      user.role === "SITE_SUPERVISOR" ||
      (user.name && user.name.toLowerCase().includes("ranjan"));

    if (!isApprover && !isReRequest) {
      return jsonError("Forbidden: You do not have permission to approve/reject requests", 403);
    }

    if (data.entityType === "PAYMENT" || data.entityType === "EXPENSE") {
      const payment = await prisma.payment.findFirst({
        where: { id: data.entityId, organizationId: user.organizationId },
      });

      if (!payment) return jsonError("Payment record not found", "NOT_FOUND", 404);

      if (isReRequest) {
        const reRequestNote = data.reason?.trim() || "";
        const updatedAmountPaise = data.amountRupees ? Math.round(data.amountRupees * 100) : payment.amount;
        const historyStamp = `[Re-submitted for approval by ${user.name || "User"} on ${new Date().toLocaleDateString("en-IN")}]: ${reRequestNote || "Re-requested"}`;
        const updatedNotes = payment.notes ? `${payment.notes}\n${historyStamp}` : historyStamp;

        await prisma.payment.update({
          where: { id: data.entityId },
          data: {
            status: "PENDING_APPROVAL",
            rejectionReason: null,
            amount: updatedAmountPaise,
            approvalQuery: reRequestNote || payment.approvalQuery || payment.notes,
            notes: updatedNotes,
            updatedAt: new Date(),
          },
        });

        await prisma.auditEvent.create({
          data: {
            organizationId: user.organizationId,
            actorUserId: user.userId,
            action: "PAYMENT_RESUBMITTED",
            entityType: "PAYMENT",
            entityId: payment.id,
            reason: `Payment request resubmitted for approval: ${reRequestNote || "Re-request"}`,
          },
        });

        return jsonSuccess({ message: "Payment request successfully re-submitted for approval" });
      }

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
          approvedBy: `${user.name || "Administrator"} (${user.role})`,
          approvedAt: new Date(),
        },
      });
    } else if (data.entityType === "MATERIAL_REQUEST") {
      const mr = await prisma.materialRequest.findFirst({
        where: { id: data.entityId, organizationId: user.organizationId },
      });
      if (!mr) return jsonError("Material request not found or outside organization scope", 404);

      if (isReRequest) {
        const reRequestNote = data.reason?.trim() || "";
        const historyStamp = `[Re-submitted for approval by ${user.name || "User"} on ${new Date().toLocaleDateString("en-IN")}]: ${reRequestNote || "Re-requested"}`;

        await prisma.materialRequest.update({
          where: { id: data.entityId },
          data: {
            status: "PENDING",
            reviewNote: null,
            reviewedById: null,
            reviewedAt: null,
            notes: mr.notes ? `${mr.notes}\n${historyStamp}` : historyStamp,
            updatedAt: new Date(),
          },
        });

        await prisma.auditEvent.create({
          data: {
            organizationId: user.organizationId,
            actorUserId: user.userId,
            action: "MATERIAL_REQUEST_RESUBMITTED",
            entityType: "MATERIAL_REQUEST",
            entityId: mr.id,
            reason: `Material request resubmitted for approval: ${reRequestNote || "Re-request"}`,
          },
        });

        return jsonSuccess({ message: "Material request successfully re-submitted for approval" });
      }

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

      if (isReRequest) {
        const reRequestNote = data.reason?.trim() || "";
        const updatedAmountPaise = data.amountRupees ? Math.round(data.amountRupees * 100) : po.totalAmount;
        const historyStamp = `[Re-submitted for approval by ${user.name || "User"} on ${new Date().toLocaleDateString("en-IN")}]: ${reRequestNote || "Re-requested"}`;

        await prisma.purchaseOrder.update({
          where: { id: data.entityId },
          data: {
            status: "PENDING_APPROVAL",
            rejectionReason: null,
            totalAmount: updatedAmountPaise,
            approvalQuery: reRequestNote || po.approvalQuery,
            notes: po.notes ? `${po.notes}\n${historyStamp}` : historyStamp,
            updatedAt: new Date(),
          },
        });

        await prisma.auditEvent.create({
          data: {
            organizationId: user.organizationId,
            actorUserId: user.userId,
            action: "PURCHASE_ORDER_RESUBMITTED",
            entityType: "PURCHASE_ORDER",
            entityId: po.id,
            reason: `Purchase order resubmitted for approval: ${reRequestNote || "Re-request"}`,
          },
        });

        return jsonSuccess({ message: "Purchase order successfully re-submitted for approval" });
      }

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

      if (isReRequest) {
        await prisma.measurementChangeRequest.update({
          where: { id: data.entityId },
          data: {
            status: "PENDING",
            reviewerComments: null,
            reviewedBy: null,
            reviewedByName: null,
            reviewedAt: null,
          },
        });
        return jsonSuccess({ message: "Measurement change request successfully re-submitted for approval" });
      }

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
