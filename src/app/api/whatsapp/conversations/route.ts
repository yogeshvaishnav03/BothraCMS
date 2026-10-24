import { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { channels, messagingSettings } from "@/lib/messaging";
import { conversations } from "@/services/whatsapp-inbox";

export const dynamic = "force-dynamic";

/** The WhatsApp inbox: one row per number, newest first, only the chats this person may see. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const s = await messagingSettings(user.organizationId);
    const list = await conversations(user.organizationId, user.role);
    return jsonSuccess({ conversations: list, inboxReady: channels(s).inbox, testMode: s.testMode, hasOrderTemplate: !!s.waOrderTemplate });
  } catch (error) {
    return handleApiError(error);
  }
}
