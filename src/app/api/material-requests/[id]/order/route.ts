import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { MaterialRequestService } from "@/services/material-request-service";

export const dynamic = "force-dynamic";

const orderSchema = z.object({
  itemId: z.string().min(1),
  vendorPartyId: z.string().min(1),
  materialId: z.string().nullable().optional(),
  unitRate: z.number().min(0).max(1e9).nullable().optional(), // rupees per unit
  expectedDeliveryDate: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || !isNaN(d.getTime()), "Invalid date"),
});

/** Turn one approved line of a request into a purchase order. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    const { itemId, ...rest } = orderSchema.parse(await req.json());
    return jsonSuccess(await MaterialRequestService.orderItem(user, params.id, itemId, rest), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
