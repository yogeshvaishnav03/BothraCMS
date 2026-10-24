import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError, jsonError } from "@/lib/api-response";
import { canSeeChat, sendOrderToVendor } from "@/services/whatsapp-inbox";

export const dynamic = "force-dynamic";

/** Sends an approved order to the vendor from the business number; their reply comes back into the app. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    if (!canSeeChat(user.role, "VENDOR")) return jsonError("You cannot send orders to vendors", "FORBIDDEN", 403);
    const message = await sendOrderToVendor(user.organizationId, params.id, user.userId);
    if (message.status !== "FAILED") {
      await prisma.purchaseOrder.updateMany({ where: { id: params.id, organizationId: user.organizationId }, data: { notificationSent: true, notificationSentAt: new Date() } });
    }
    return jsonSuccess({ message }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
