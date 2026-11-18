import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const approvalActionSchema = z.object({
  entityType: z.enum(["PAYMENT", "EXPENSE", "MATERIAL_REQUEST", "MEASUREMENT_CHANGE"]),
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
    const isSupervisorOrEngineer = roleStr === "SITE_ENGINEER" || user.role === "SITE_SUPERVISOR" || user.role === "PROJECT_MANAGER";

    // 1. Pending Payments / Expenses
    const paymentWhere: any = {
      organizationId: user.organizationId,
      isArchived: false,
    };

    if (isSuperAdmin || isAccountant) {
      paymentWhere.status = "PENDING_APPROVAL";
    } else {
      // For Engineer / Supervisor, fetch recent requests submitted by them (all statuses)
      paymentWhere.createdBy = user.userId;
    }

    const [payments, materialRequests, measurementChanges] = await Promise.all([
      prisma.payment.findMany({
        where: paymentWhere,
        include: {
          project: { include: { site: true } },
          creator: { select: { id: true, name: true, role: true } },
          party: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),

      // 2. Material Requests
      prisma.materialRequest.findMany({
        where: {
          organizationId: user.organizationId,
          ...(isSuperAdmin ? { status: "PENDING" } : { requestedById: user.userId }),
        },
        include: {
          project: { include: { site: true } },
          items: { include: { material: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
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
    ]);

    const formattedPayments = payments.map((p) => {
      const isOop = p.recipientType === "OUT_OF_POCKET";
      return {
        id: p.id,
        type: isOop ? "EXPENSE" : "PAYMENT",
        title: isOop ? `Cash Expense: ${p.notes || "Petty Cash"}` : `Payment to ${p.recipientName || p.party?.name || "Vendor"}`,
        amountRupees: (p.amount || 0) / 100,
        status: p.status,
        projectName: p.project?.name || "General",
        siteName: p.project?.site?.name || "Site",
        requestedBy: p.creator?.name || "Staff",
        requestedByRole: p.creator?.role || "USER",
        rejectionReason: p.rejectionReason || null,
        date: p.paymentDate ? p.paymentDate.toISOString() : p.createdAt.toISOString(),
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
      requestedBy: "Worksite Team",
      requestedByRole: "SITE_TEAM",
      rejectionReason: mr.reviewNote || null,
      date: mr.createdAt.toISOString(),
    }));

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
      isApprover: isSuperAdmin || isAccountant,
      items: [
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
