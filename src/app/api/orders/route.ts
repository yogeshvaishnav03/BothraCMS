import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

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
  notificationMethod: z.string().default("WHATSAPP_AND_EMAIL"),
});

function formatNotificationMessage(data: {
  orderNumber: string;
  organizationName: string;
  vendorName: string;
  materialName: string;
  materialSku: string;
  quantity: number;
  unitCode: string;
  unitRate?: number | null;
  totalAmount?: number | null;
  deliveryLocation?: string | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  orderedByName: string;
}) {
  const parts = [
    `🏗️ *PURCHASE ORDER: ${data.orderNumber}*`,
    `*${data.organizationName}*`,
    ``,
    `Dear *${data.vendorName}*,`,
    `A new material purchase order has been placed with you for site supply:`,
    ``,
    `📦 *Material:* ${data.materialName} (${data.materialSku})`,
    `🔢 *Quantity:* ${data.quantity} ${data.unitCode}`,
  ];

  if (data.unitRate && data.unitRate > 0) {
    const rateRupees = data.unitRate / 100;
    parts.push(`💰 *Rate:* ₹${rateRupees.toFixed(2)} / ${data.unitCode}`);
  }
  if (data.totalAmount && data.totalAmount > 0) {
    const totalRupees = data.totalAmount / 100;
    parts.push(`💵 *Estimated Total:* ₹${totalRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
  }
  if (data.deliveryLocation) {
    parts.push(`📍 *Delivery Location:* ${data.deliveryLocation}`);
  }
  if (data.expectedDeliveryDate) {
    parts.push(`📅 *Expected Delivery:* ${data.expectedDeliveryDate}`);
  }
  if (data.notes && data.notes.trim()) {
    parts.push(`📝 *Instructions / Notes:* ${data.notes.trim()}`);
  }

  parts.push(``);
  parts.push(`👤 *Ordered by:* ${data.orderedByName}`);
  parts.push(`Please confirm order receipt, stock availability, and your dispatch timeline.`);
  parts.push(`Thank you!`);

  return parts.join("\n");
}

function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  // If standard 10-digit Indian mobile, prepend country code 91
  const cleanPhone = digits.length === 10 ? `91${digits}` : digits;
  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
}

function buildMailtoUrl(email: string | null | undefined, subject: string, body: string): string | null {
  if (!email || !email.includes("@")) return null;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const materialId = searchParams.get("materialId");
    const vendorPartyId = searchParams.get("vendorPartyId");
    const status = searchParams.get("status");
    const siteId = searchParams.get("siteId");

    const where: any = { organizationId: user.organizationId };
    if (materialId) where.materialId = materialId;
    if (vendorPartyId) where.vendorPartyId = vendorPartyId;
    if (status) where.status = status;
    if (siteId) where.siteId = siteId;

    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        material: { select: { id: true, name: true, sku: true, unitCode: true } },
        vendor: { select: { id: true, name: true, phone: true, email: true, address: true } },
        store: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const enriched = orders.map((o) => {
      const orgName = user.organizationName || "Bothra Infrastructure";
      const deliveryLocation = o.store ? `${o.site?.name || "Site"} — ${o.store.name}` : o.site?.name || "Main Site Yard";
      const expDateStr = o.expectedDeliveryDate ? new Date(o.expectedDeliveryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;
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
        orderedByName: o.creator?.name || user.name || "Site Supervisor",
      });

      return {
        ...o,
        notificationMessage: message,
        whatsappUrl: buildWhatsAppUrl(o.vendor.phone, message),
        mailtoUrl: buildMailtoUrl(o.vendor.email, `Purchase Order: ${o.orderNumber} - ${o.material.name}`, message),
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
        status: "PLACED",
        expectedDeliveryDate: parsedExpDate,
        notes: notes || null,
        notificationMethod: notificationMethod || "WHATSAPP_AND_EMAIL",
        notificationSent: true,
        notificationSentAt: now,
        createdBy: user.userId,
      },
      include: {
        material: { select: { id: true, name: true, sku: true, unitCode: true } },
        vendor: { select: { id: true, name: true, phone: true, email: true, address: true } },
        store: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, code: true } },
      },
    });

    // Record Audit Event
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "PURCHASE_ORDER_PLACED",
        entityType: "PURCHASE_ORDER",
        entityId: purchaseOrder.id,
        afterJson: JSON.stringify({
          orderNumber,
          material: material.name,
          quantity,
          unitCode,
          vendor: vendor.name,
          totalAmount: totalAmountPaise,
        }),
        reason: `Placed material purchase order ${orderNumber} to vendor ${vendor.name}`,
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
      orderedByName: user.name,
    });

    const whatsappUrl = buildWhatsAppUrl(vendor.phone, notificationMessage);
    const mailtoUrl = buildMailtoUrl(
      vendor.email,
      `Purchase Order: ${orderNumber} - ${material.name} - ${organizationName}`,
      notificationMessage
    );

    return jsonSuccess({
      order: purchaseOrder,
      notification: {
        sent: true,
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
