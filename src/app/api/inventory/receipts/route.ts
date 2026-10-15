import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { InventoryService } from "@/services/inventory-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

const receiptSchema = z.object({
  storeId: z.string().min(1),
  vendorPartyId: z.string().min(1).optional(),
  referenceDoc: z.string().optional(),
  notes: z.string().optional(),
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
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = receiptSchema.parse(body);

    const result = await InventoryService.receiveGoods({
      organizationId: user.organizationId,
      storeId: data.storeId,
      vendorPartyId: data.vendorPartyId,
      referenceDoc: data.referenceDoc,
      notes: data.notes,
      items: data.items,
      userId: user.userId,
      role: user.role,
    });

    return jsonSuccess(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
