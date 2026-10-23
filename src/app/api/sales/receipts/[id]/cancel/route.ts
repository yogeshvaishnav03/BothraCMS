import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { SalesService } from "@/services/sales-service";

export const dynamic = "force-dynamic";

const schema = z.object({ reason: z.string().min(3, "Say why the receipt is being cancelled").max(300) });

/** Cancel a receipt (admin): wrong entry or a bounced cheque. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:write");
    const { reason } = schema.parse(await req.json());
    await SalesService.cancelReceipt(user, params.id, reason);
    return jsonSuccess(await SalesService.bookings(user));
  } catch (error) {
    return handleApiError(error);
  }
}
