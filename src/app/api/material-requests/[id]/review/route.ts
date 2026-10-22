import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { MaterialRequestService } from "@/services/material-request-service";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(1000).nullable().optional(),
  items: z.array(z.object({ id: z.string(), approvedQty: z.number().min(0).max(1e9) })).optional(),
});

/** Approve (optionally cutting quantities) or reject a request. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    return jsonSuccess(await MaterialRequestService.review(user, params.id, reviewSchema.parse(await req.json())));
  } catch (error) {
    return handleApiError(error);
  }
}
