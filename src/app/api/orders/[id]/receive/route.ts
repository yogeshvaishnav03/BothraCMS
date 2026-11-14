import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { getStorageProvider, backupFileToDatabase } from "@/lib/storage";
import {
  STANDARD_ALLOWED_MIME_TYPES as ALLOWED_MIME_TYPES,
  STANDARD_EXTENSION_MAP as EXTENSION_MAP,
  isValidMagicBytes,
  sanitizeFileName,
} from "@/lib/upload-validation";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB limit for bill photos

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);

    const orderId = params.id;
    if (!orderId) {
      return jsonError("Order ID is required", "BAD_REQUEST", 400);
    }

    // Fetch the purchase order
    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id: orderId,
        organizationId: user.organizationId,
      },
      include: {
        material: { select: { id: true, name: true, sku: true, unitCode: true } },
        vendor: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, siteId: true } },
        store: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
        requestItems: { select: { id: true, requestId: true } },
      },
    });

    if (!order) {
      return jsonError("Purchase order not found", "NOT_FOUND", 404);
    }

    if (order.status === "CANCELLED" || order.status === "REJECTED") {
      return jsonError(`Cannot receive goods for a ${order.status.toLowerCase()} order.`, "INVALID_STATE", 400);
    }

    // Parse input (supports multipart FormData or JSON)
    const contentType = req.headers.get("content-type") || "";
    let receivedQuantity = order.quantity;
    let storeId = order.storeId || "";
    let billNumber = "";
    let billDateStr = new Date().toISOString().slice(0, 10);
    let unitRateRupees = order.unitRate ? order.unitRate / 100 : 0;
    let totalAmountRupees = unitRateRupees > 0 ? unitRateRupees * receivedQuantity : 0;
    let notes = "";
    let billFile: File | null = null;
    let existingAttachmentId: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const rawQty = formData.get("receivedQuantity");
      if (rawQty !== null && rawQty !== "") receivedQuantity = Number(rawQty);

      const rawStore = formData.get("storeId");
      if (rawStore) storeId = String(rawStore);

      const rawBillNum = formData.get("billNumber");
      if (rawBillNum) billNumber = String(rawBillNum).trim();

      const rawBillDate = formData.get("billDate");
      if (rawBillDate) billDateStr = String(rawBillDate).trim();

      const rawRate = formData.get("unitRate");
      if (rawRate !== null && rawRate !== "") unitRateRupees = Number(rawRate);

      const rawTotal = formData.get("totalAmount");
      if (rawTotal !== null && rawTotal !== "") totalAmountRupees = Number(rawTotal);

      const rawNotes = formData.get("notes");
      if (rawNotes) notes = String(rawNotes).trim();

      const file = formData.get("file") as File | null;
      if (file && file.size > 0) billFile = file;

      const rawAttId = formData.get("attachmentId");
      if (rawAttId) existingAttachmentId = String(rawAttId).trim();
    } else {
      const body = await req.json().catch(() => ({}));
      if (body.receivedQuantity !== undefined && body.receivedQuantity !== null) {
        receivedQuantity = Number(body.receivedQuantity);
      }
      if (body.storeId) storeId = String(body.storeId);
      if (body.billNumber) billNumber = String(body.billNumber).trim();
      if (body.billDate) billDateStr = String(body.billDate).trim();
      if (body.unitRate !== undefined && body.unitRate !== null) unitRateRupees = Number(body.unitRate);
      if (body.totalAmount !== undefined && body.totalAmount !== null) totalAmountRupees = Number(body.totalAmount);
      if (body.notes) notes = String(body.notes).trim();
      if (body.attachmentId) existingAttachmentId = String(body.attachmentId).trim();
    }

    if (isNaN(receivedQuantity) || receivedQuantity <= 0) {
      return jsonError("Received quantity must be a positive number", "INVALID_QUANTITY", 400);
    }

    // Resolve target store/yard
    let targetStoreId = storeId;
    if (!targetStoreId) {
      const siteIdToUse = order.siteId || order.project?.siteId;
      const store = await prisma.store.findFirst({
        where: {
          organizationId: user.organizationId,
          isArchived: false,
          ...(siteIdToUse ? { siteId: siteIdToUse } : {}),
        },
        orderBy: { createdAt: "asc" },
      });
      if (store) {
        targetStoreId = store.id;
      } else {
        // Fallback to any active store in the org
        const anyStore = await prisma.store.findFirst({
          where: { organizationId: user.organizationId, isArchived: false },
        });
        if (anyStore) {
          targetStoreId = anyStore.id;
        } else {
          // Store requires a non-null siteId relation. Resolve or create a site:
          let resolvedSiteId = siteIdToUse;
          if (!resolvedSiteId) {
            const firstSite = await prisma.site.findFirst({
              where: { organizationId: user.organizationId, isArchived: false },
              select: { id: true },
            });
            resolvedSiteId = firstSite?.id;
          }

          if (!resolvedSiteId) {
            const defaultSite = await prisma.site.create({
              data: {
                organizationId: user.organizationId,
                name: "Main Construction Site",
                code: "MAIN",
                status: "ACTIVE",
              },
            });
            resolvedSiteId = defaultSite.id;
          }

          // Auto-create a default main yard store if none exists
          const newStore = await prisma.store.create({
            data: {
              organizationId: user.organizationId,
              name: "Main Site Yard",
              status: "ACTIVE",
              siteId: resolvedSiteId,
            },
          });
          targetStoreId = newStore.id;
        }
      }
    }

    // Resolve bill number
    if (!billNumber) {
      const todayCompact = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      billNumber = `INV-${order.orderNumber.replace(/^PO-/, "") || todayCompact}`;
    }

    // Calculate amounts in paise (minor units)
    if (isNaN(unitRateRupees) || unitRateRupees < 0) unitRateRupees = 0;
    if (isNaN(totalAmountRupees) || totalAmountRupees <= 0) {
      totalAmountRupees = unitRateRupees * receivedQuantity;
    }
    const unitRatePaise = Math.round(unitRateRupees * 100);
    const totalPaise = Math.round(totalAmountRupees * 100);

    const billDate = new Date(billDateStr);
    const validBillDate = isNaN(billDate.getTime()) ? new Date() : billDate;

    // Step 1: Process file upload if a bill photo is attached
    let createdAttachmentId: string | null = null;
    if (billFile) {
      if (!ALLOWED_MIME_TYPES.has(billFile.type)) {
        return jsonError(
          `Invalid file format '${billFile.type}'. Supported formats: JPEG, PNG, WEBP, PDF`,
          "INVALID_FILE_TYPE",
          400
        );
      }

      if (billFile.size > MAX_FILE_SIZE_BYTES) {
        return jsonError(
          `File size (${(billFile.size / 1024 / 1024).toFixed(2)} MB) exceeds limit of 15 MB`,
          "FILE_TOO_LARGE",
          400
        );
      }

      const fileBuffer = Buffer.from(await billFile.arrayBuffer());
      if (!isValidMagicBytes(fileBuffer, billFile.type)) {
        return jsonError("File signature verification failed", "MIME_SPOOFING_DETECTED", 400);
      }

      const safeExt = EXTENSION_MAP[billFile.type] || ".jpg";
      const fileId = crypto.randomUUID();
      const diskFileName = `${user.organizationId}_${fileId}${safeExt}`;
      const sanitizedOriginalName = sanitizeFileName(billFile.name || `bill_${billNumber}${safeExt}`);

      // Save to storage provider
      const storage = getStorageProvider();
      await storage.put(diskFileName, fileBuffer, billFile.type);

      // Backup to database blob for Vercel/ephemeral container persistence
      try {
        await backupFileToDatabase(
          user.organizationId,
          [`FILE_BLOB_${fileId}`, `FILE_BLOB_${diskFileName}`],
          fileBuffer
        );
      } catch (err) {
        console.warn("Notice: Blob database backup skipped in order receive:", err);
      }

      // Create initial Attachment record
      const att = await prisma.attachment.create({
        data: {
          organizationId: user.organizationId,
          entityType: "BILL",
          entityId: fileId, // temporary, will be updated to bill.id
          fileId,
          fileName: sanitizedOriginalName,
          fileSize: billFile.size,
          mimeType: billFile.type,
          category: "INVOICE",
          diskFileName,
          projectId: order.projectId || null,
          notes: notes || `Bill photo for ${order.orderNumber}`,
          uploadedById: user.userId,
        },
      });
      createdAttachmentId = att.id;
    }

    const attachmentIdToLink = createdAttachmentId || existingAttachmentId;

    // Step 2 & 3: Atomic execution for StockMovement, StockBalance, Bill, and PurchaseOrder
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create StockMovement (RECEIPT)
      const movement = await tx.stockMovement.create({
        data: {
          organizationId: user.organizationId,
          materialId: order.materialId,
          storeId: targetStoreId,
          movementType: "RECEIPT",
          quantityDelta: receivedQuantity,
          unitCode: order.unitCode,
          unitRate: unitRatePaise,
          movementAt: validBillDate,
          vendorPartyId: order.vendorPartyId,
          projectId: order.projectId || null,
          referenceDoc: billNumber,
          notes: notes || `Goods received against PO ${order.orderNumber} (Bill #${billNumber})`,
          createdBy: user.userId,
        },
      });

      // 2. Upsert StockBalance in Materials & Stock
      const existingBalance = await tx.stockBalance.findUnique({
        where: {
          materialId_storeId: {
            materialId: order.materialId,
            storeId: targetStoreId,
          },
        },
      });

      if (existingBalance) {
        await tx.stockBalance.update({
          where: { id: existingBalance.id },
          data: {
            quantityOnHand: Math.round((existingBalance.quantityOnHand + receivedQuantity) * 1000) / 1000,
          },
        });
      } else {
        await tx.stockBalance.create({
          data: {
            materialId: order.materialId,
            storeId: targetStoreId,
            quantityOnHand: Math.round(receivedQuantity * 1000) / 1000,
          },
        });
      }

      // 3. Ensure unique bill number for this vendor & organization
      let uniqueBillNumber = billNumber;
      const existingBill = await tx.bill.findUnique({
        where: {
          organizationId_partyId_billNumber: {
            organizationId: user.organizationId,
            partyId: order.vendorPartyId,
            billNumber: uniqueBillNumber,
          },
        },
      });
      if (existingBill) {
        uniqueBillNumber = `${billNumber}-${order.orderNumber.slice(-4)}`;
      }

      // 4. Create Bill in Payments & Bills
      const bill = await tx.bill.create({
        data: {
          organizationId: user.organizationId,
          partyId: order.vendorPartyId,
          projectId: order.projectId || null,
          billNumber: uniqueBillNumber,
          billDate: validBillDate,
          dueDate: new Date(validBillDate.getTime() + 15 * 86400000), // Default 15 days credit
          totalAmount: totalPaise,
          taxableAmount: totalPaise,
          status: "POSTED",
          costHead: "MATERIAL",
          notes: notes || `Goods received against PO ${order.orderNumber}`,
          createdBy: user.userId,
          lines: {
            create: [
              {
                description: `${order.material.name} (${receivedQuantity} ${order.unitCode})`,
                materialId: order.materialId,
                quantity: receivedQuantity,
                unitRate: unitRatePaise,
                lineTotal: totalPaise,
                taxAmount: 0,
              },
            ],
          },
        },
      });

      // 5. Link Attachment to Bill & StockMovement
      if (attachmentIdToLink) {
        await tx.attachment.update({
          where: { id: attachmentIdToLink },
          data: {
            entityType: "BILL",
            entityId: bill.id,
            category: "INVOICE",
            stockMovementId: movement.id,
            projectId: order.projectId || null,
          },
        });
      }

      // 6. Update PurchaseOrder status to DELIVERED
      const updatedOrder = await tx.purchaseOrder.update({
        where: { id: order.id },
        data: {
          status: "DELIVERED",
          notes: order.notes
            ? `${order.notes} | Delivered: ${receivedQuantity} ${order.unitCode} on ${validBillDate.toISOString().slice(0, 10)} (Bill #${uniqueBillNumber})`
            : `Delivered: ${receivedQuantity} ${order.unitCode} on ${validBillDate.toISOString().slice(0, 10)} (Bill #${uniqueBillNumber})`,
        },
      });

      // 7. If linked to MaterialRequest, check if all request items are ordered/delivered
      for (const item of order.requestItems) {
        if (item.requestId) {
          const reqItems = await tx.materialRequestItem.findMany({
            where: { requestId: item.requestId },
            include: { purchaseOrder: { select: { status: true } } },
          });
          const allDelivered = reqItems.every((ri) => ri.purchaseOrder?.status === "DELIVERED");
          if (allDelivered) {
            await tx.materialRequest.update({
              where: { id: item.requestId },
              data: { status: "ORDERED" },
            });
          }
        }
      }

      // 8. Create Audit Event
      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: "ORDER_RECEIVED_AND_BILLED",
          entityType: "PURCHASE_ORDER",
          entityId: order.id,
          reason: `Received ${receivedQuantity} ${order.unitCode} for ${order.material.name}. Added to Materials & Stock (Movement #${movement.id}) and Payments & Bills (Bill #${uniqueBillNumber}).`,
          afterJson: JSON.stringify({
            orderNumber: order.orderNumber,
            material: order.material.name,
            quantity: receivedQuantity,
            storeId: targetStoreId,
            billNumber: uniqueBillNumber,
            totalPaise,
            attachmentId: attachmentIdToLink,
          }),
        },
      });

      return {
        order: updatedOrder,
        stockMovement: movement,
        bill,
        attachmentId: attachmentIdToLink,
      };
    });

    return jsonSuccess({
      message: `Goods received successfully! ${receivedQuantity} ${order.unitCode} of ${order.material.name} added to Materials & Stock, and Bill #${result.bill.billNumber} added to Payments & Bills.`,
      ...result,
    }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
