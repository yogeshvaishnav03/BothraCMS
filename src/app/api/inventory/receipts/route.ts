import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { InventoryService } from "@/services/inventory-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

import { requireUserContext, requireProjectAccess } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const receiptSchema = z.object({
  storeId: z.string().min(1),
  vendorPartyId: z.string().min(1).optional(),
  projectId: z.string().optional(),
  referenceDoc: z.string().optional(),
  notes: z.string().optional(),
  movementType: z.enum(["RECEIPT", "OPENING"]).optional(),
  idempotencyKey: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
  items: z.array(
    z.object({
      materialId: z.string().min(1),
      quantity: z.number().positive(),
      unitRate: z.number().optional(), // currency
    })
  ).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req, "inventory:receipt");

    const body = await req.json();
    const data = receiptSchema.parse(body);

    if (data.projectId) {
      await requireProjectAccess(user, data.projectId, "inventory:receipt");
    }

    const result = await InventoryService.receiveGoods({
      organizationId: user.organizationId,
      storeId: data.storeId,
      vendorPartyId: data.vendorPartyId,
      projectId: data.projectId,
      referenceDoc: data.referenceDoc,
      notes: data.notes,
      movementType: data.movementType,
      idempotencyKey: data.idempotencyKey,
      items: data.items,
      attachmentIds: data.attachmentIds,
      userId: user.userId,
      role: user.role,
    });

    return jsonSuccess(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
