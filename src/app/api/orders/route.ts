import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { alertStaffNow } from "@/services/staff-alerts";
import {
  formatNotificationMessage,
  buildWhatsAppUrl,
  buildMailtoUrl,
} from "@/lib/order-notifications";

export const dynamic = "force-dynamic";

const placeOrderSchema = z.object({
  materialId: z.string().min(1, "Material ID is required"),
  vendorPartyId: z.string().min(1, "Vendor / Party is required"),
  quantity: z.number().positive("Order quantity must be greater than zero"),
  unitCode: z.string().min(1, "Unit code is required"),
  unitRate: z.number().min(0).optional().nullable(),
  storeId: z.string().optional().nullable(),
  siteId: z.string().optional().nullable(),
  expectedDeliveryDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  approvalQuery: z.string().optional().nullable(),
  autoApprove: z.boolean().optional(),
  notificationMethod: z.string().default("WHATSAPP_AND_EMAIL"),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const materialId = searchParams.get("materialId");
    const vendorPartyId = searchParams.get("vendorPartyId");
    const status = searchParams.get("status");
    const siteId = searchParams.get("siteId");
    const allTenants = searchParams.get("allTenants") === "true";

    const where: any = {};

    // Allow global Super Admin to inspect orders across tenants if explicitly requested
    if (!(user.role === "SUPER_ADMIN" && allTenants)) {
      where.organizationId = user.organizationId;
    }

    if (materialId) where.materialId = materialId;
    if (vendorPartyId) where.vendorPartyId = vendorPartyId;
    if (status) {
      if (status.includes(",")) {
        where.status = { in: status.split(",").map((s) => s.trim()) };
      } else {
        where.status = status;
      }
    }
    if (siteId) where.siteId = siteId;

    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        material: { select: { id: true, name: true, sku: true, unitCode: true } },
        vendor: { select: { id: true, name: true, phone: true, whatsappNumber: true, whatsappGroupLink: true, email: true, address: true } },
        store: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const enriched = orders.map((o) => {
      const orgName = o.organization?.name || user.organizationName || "Bothra Infrastructure";
      const deliveryLocation = o.store
        ? `${o.site?.name || "Site"} — ${o.store.name}`
        : o.site?.name || "Main Site Yard";
      const expDateStr = o.expectedDeliveryDate
        ? new Date(o.expectedDeliveryDate).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : null;

      const message = formatNotificationMessage({
        orderNumber: o.orderNumber,
        organizationName: orgName,
        vendorName: o.vendor.name,
        materialName: o.material.name,
        materialSku: o.material.sku,
        quantity: o.quantity,
        unitCode: o.unitCode,
        unitRate: o.unitRate,
        totalAmount: o.totalAmount,
        deliveryLocation,
        expectedDeliveryDate: expDateStr,
        notes: o.notes,
        approvalQuery: o.approvalQuery,
        orderedByName: o.creator?.name || user.name || "Site Supervisor",
        approvedByName: o.approvedBy,
      });

      return {
        ...o,
        notificationMessage: message,
        whatsappUrl: buildWhatsAppUrl(o.vendor.phone, message),
        mailtoUrl: buildMailtoUrl(
          o.vendor.email,
          `Purchase Order: ${o.orderNumber} - ${o.material.name}`,
          message
        ),
      };
    });

    return jsonSuccess(enriched);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const parsed = placeOrderSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.errors[0]?.message || "Invalid order parameters", "BAD_REQUEST", 400);
    }

    const {
      materialId,
      vendorPartyId,
      quantity,
      unitCode,
      unitRate,
      storeId,
      siteId,
      expectedDeliveryDate,
      notes,
      approvalQuery,
      autoApprove,
      notificationMethod,
    } = parsed.data;

    // Verify Material
    const material = await prisma.material.findFirst({
      where: { id: materialId, organizationId: user.organizationId },
    });
    if (!material) {
      return jsonError("Material not found in this organization", "NOT_FOUND", 404);
    }

    // Verify Vendor
    const vendor = await prisma.party.findFirst({
      where: { id: vendorPartyId, organizationId: user.organizationId },
    });
    if (!vendor) {
      return jsonError("Vendor not found in this organization", "NOT_FOUND", 404);
    }

    // Fetch Store and Site if specified
    let storeName: string | null = null;
    let siteRecord: any = null;

    if (storeId) {
      const store = await prisma.store.findFirst({
        where: { id: storeId, organizationId: user.organizationId },
        include: { site: true },
      });
      if (store) {
        storeName = `${store.site?.name || "Site"} — ${store.name}`;
        siteRecord = store.site;
      }
    } else if (siteId) {
      siteRecord = await prisma.site.findFirst({
        where: { id: siteId, organizationId: user.organizationId },
      });
      if (siteRecord) {
        storeName = `${siteRecord.name} (General Site)`;
      }
    }

    // Fetch Organization name
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true },
    });
    const organizationName = org?.name || user.organizationName || "Bothra Infrastructure";

    // Generate unique order number: PO-YYYYMMDD-XXXX
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
    const orderNumber = `PO-${dateStr}-${randomSuffix}`;

    const unitRatePaise = unitRate && unitRate > 0 ? Math.round(unitRate * 100) : null;
    const totalAmountPaise = unitRatePaise ? Math.round(quantity * unitRatePaise) : null;
    const parsedExpDate = expectedDeliveryDate ? new Date(expectedDeliveryDate) : null;

    // Workflow: Any order raised by users requires Super Admin confirmation and approval!
    // If the creator IS Super Admin and explicitly requested autoApprove, approve immediately.
    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const shouldApproveImmediately = isSuperAdmin && autoApprove === true;
    const initialStatus = shouldApproveImmediately ? "APPROVED" : "PENDING_APPROVAL";

    const orderQueryText =
      approvalQuery?.trim() ||
      notes?.trim() ||
      `Order placed by ${user.name} (${user.role}) for ${quantity} ${unitCode} ${material.name} awaiting Super Admin approval`;

    // Create PurchaseOrder record
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        organizationId: user.organizationId,
        orderNumber,
        materialId,
        vendorPartyId,
        storeId: storeId || null,
        siteId: siteId || siteRecord?.id || null,
        quantity,
        unitCode,
        unitRate: unitRatePaise,
        totalAmount: totalAmountPaise,
        status: initialStatus,
        approvalQuery: orderQueryText,
        approvedBy: shouldApproveImmediately ? `${user.name} (${user.role})` : null,
        approvedAt: shouldApproveImmediately ? now : null,
        expectedDeliveryDate: parsedExpDate,
        notes: notes || null,
        notificationMethod: notificationMethod || "WHATSAPP_AND_EMAIL",
        notificationSent: shouldApproveImmediately,
        notificationSentAt: shouldApproveImmediately ? now : null,
        createdBy: user.userId,
      },
      include: {
        material: { select: { id: true, name: true, sku: true, unitCode: true } },
        vendor: { select: { id: true, name: true, phone: true, whatsappNumber: true, whatsappGroupLink: true, email: true, address: true } },
        store: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    // Record Audit Event
    const auditAction = shouldApproveImmediately
      ? "PURCHASE_ORDER_APPROVED"
      : "PURCHASE_ORDER_QUERY_RAISED";

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: auditAction,
        entityType: "PURCHASE_ORDER",
        entityId: purchaseOrder.id,
        afterJson: JSON.stringify({
          orderNumber,
          material: material.name,
          quantity,
          unitCode,
          vendor: vendor.name,
          totalAmount: totalAmountPaise,
          status: initialStatus,
          approvalQuery: orderQueryText,
        }),
        reason: shouldApproveImmediately
          ? `Directly placed and approved purchase order ${orderNumber} by Super Admin ${user.name}`
          : `Raised purchase order query ${orderNumber} to Super Admin for approval and confirmation`,
      },
    });

    const expDateFormatted = parsedExpDate
      ? parsedExpDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : null;

    const notificationMessage = formatNotificationMessage({
      orderNumber,
      organizationName,
      vendorName: vendor.name,
      materialName: material.name,
      materialSku: material.sku,
      quantity,
      unitCode,
      unitRate: unitRatePaise,
      totalAmount: totalAmountPaise,
      deliveryLocation: storeName,
      expectedDeliveryDate: expDateFormatted,
      notes,
      approvalQuery: orderQueryText,
      orderedByName: user.name,
      approvedByName: shouldApproveImmediately ? `${user.name} (${user.role})` : null,
    });

    if (initialStatus === "PENDING_APPROVAL") await alertStaffNow(user.organizationId);

    const whatsappUrl = buildWhatsAppUrl(vendor.phone, notificationMessage);
    const mailtoUrl = buildMailtoUrl(
      vendor.email,
      `Purchase Order: ${orderNumber} - ${material.name} - ${organizationName}`,
      notificationMessage
    );

    return jsonSuccess({
      order: purchaseOrder,
      status: initialStatus,
      isPendingApproval: initialStatus === "PENDING_APPROVAL",
      message:
        initialStatus === "PENDING_APPROVAL"
          ? "Order query successfully raised to Super Admin for approval and confirmation. Vendor dispatch will be activated upon approval."
          : "Purchase order approved and ready for vendor dispatch.",
      notification: {
        sent: shouldApproveImmediately,
        vendorName: vendor.name,
        vendorPhone: vendor.phone,
        vendorEmail: vendor.email,
        message: notificationMessage,
        whatsappUrl,
        mailtoUrl,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
