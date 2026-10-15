import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { InventoryService } from "@/services/inventory-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

const issueSchema = z.object({
  storeId: z.string().min(1),
  materialId: z.string().min(1),
  quantity: z.number().positive(),
  projectId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = issueSchema.parse(body);

    const result = await InventoryService.issueGoods({
      organizationId: user.organizationId,
      storeId: data.storeId,
      materialId: data.materialId,
      quantity: data.quantity,
      projectId: data.projectId,
      taskId: data.taskId,
      notes: data.notes,
      userId: user.userId,
      role: user.role,
    });

    return jsonSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
