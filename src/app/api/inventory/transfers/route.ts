import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { InventoryService } from "@/services/inventory-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

const transferSchema = z.object({
  sourceStoreId: z.string().min(1),
  targetStoreId: z.string().min(1),
  materialId: z.string().min(1),
  quantity: z.number().positive(),
  referenceDoc: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = transferSchema.parse(body);

    const result = await InventoryService.transferGoods({
      organizationId: user.organizationId,
      sourceStoreId: data.sourceStoreId,
      targetStoreId: data.targetStoreId,
      materialId: data.materialId,
      quantity: data.quantity,
      referenceDoc: data.referenceDoc,
      notes: data.notes,
      userId: user.userId,
      role: user.role,
    });

    return jsonSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
