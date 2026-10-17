import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import {
  formatNotificationMessage,
  buildWhatsAppUrl,
  buildMailtoUrl,
} from "@/lib/order-notifications";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    // Only Super Admin or Organization Admin can approve purchase orders
    const canApprove = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";
    if (!canApprove) {
      return jsonError(
        "Super Admin or Organization Admin credentials required to approve purchase orders",
        "FORBIDDEN",
        403
      );
    }

    const where: any = { id: params.id };
    if (user.role !== "SUPER_ADMIN") {
      where.organizationId = user.organizationId;
    }

    const existing = await prisma.purchaseOrder.findFirst({
      where,
      include: {
        organization: true,
        material: true,
        vendor: true,
        store: true,
        site: true,
        creator: true,
      },
    });

    if (!existing) {
      return jsonError("Purchase order not found", "NOT_FOUND", 404);
    }

    let bodyNotes = "";
    try {
      const body = await req.json();
      if (body && typeof body.notes === "string") {
        bodyNotes = body.notes.trim();
      }
    } catch {
      // Body is optional
    }

    const now = new Date();
    const updatedNotes = bodyNotes
      ? `${existing.notes ? existing.notes + "\n" : ""}[Approved by ${user.name}]: ${bodyNotes}`
      : existing.notes;

    const updated = await prisma.purchaseOrder.update({
      where: { id: existing.id },
      data: {
        status: "APPROVED",
        approvedBy: `${user.name} (${user.role})`,
        approvedAt: now,
        notes: updatedNotes,
        notificationSent: true,
        notificationSentAt: now,
      },
      include: {
        organization: true,
        material: true,
        vendor: true,
        store: true,
        site: true,
        creator: true,
      },
    });

    // Record Audit Event
    await prisma.auditEvent.create({
      data: {
        organizationId: existing.organizationId,
        actorUserId: user.userId,
        action: "PURCHASE_ORDER_APPROVED",
        entityType: "PURCHASE_ORDER",
        entityId: updated.id,
        beforeJson: JSON.stringify({ status: existing.status }),
        afterJson: JSON.stringify({
          status: updated.status,
          approvedBy: updated.approvedBy,
          approvedAt: updated.approvedAt,
        }),
        reason: `Purchase order ${updated.orderNumber} confirmed and approved by ${user.name} (${user.role})`,
      },
    });

    const orgName = updated.organization?.name || "Bothra Infrastructure";
    const deliveryLocation = updated.store
      ? `${updated.site?.name || "Site"} — ${updated.store.name}`
      : updated.site?.name || "Main Site Yard";

    const expDateFormatted = updated.expectedDeliveryDate
      ? new Date(updated.expectedDeliveryDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : null;

    const notificationMessage = formatNotificationMessage({
      orderNumber: updated.orderNumber,
      organizationName: orgName,
      vendorName: updated.vendor.name,
      materialName: updated.material.name,
      materialSku: updated.material.sku,
      quantity: updated.quantity,
      unitCode: updated.unitCode,
      unitRate: updated.unitRate,
      totalAmount: updated.totalAmount,
      deliveryLocation,
      expectedDeliveryDate: expDateFormatted,
      notes: updated.notes,
      approvalQuery: updated.approvalQuery,
      orderedByName: updated.creator?.name || "Site Supervisor",
      approvedByName: updated.approvedBy,
    });

    const whatsappUrl = buildWhatsAppUrl(updated.vendor.phone, notificationMessage);
    const mailtoUrl = buildMailtoUrl(
      updated.vendor.email,
      `Purchase Order Approved: ${updated.orderNumber} - ${updated.material.name}`,
      notificationMessage
    );

    return jsonSuccess({
      order: updated,
      message: `Purchase order ${updated.orderNumber} has been approved. Vendor notification ready for dispatch.`,
      notification: {
        sent: true,
        vendorName: updated.vendor.name,
        vendorPhone: updated.vendor.phone,
        vendorEmail: updated.vendor.email,
        message: notificationMessage,
        whatsappUrl,
        mailtoUrl,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
