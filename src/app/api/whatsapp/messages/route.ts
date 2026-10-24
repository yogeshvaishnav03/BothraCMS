import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { indianMobile } from "@/lib/messaging";
import { canSeeChat, findCounterpart, lastIncomingAt, replyWindowOpen, REPLY_WINDOW_MS, sendChatText } from "@/services/whatsapp-inbox";

export const dynamic = "force-dynamic";

/** One chat, oldest first. Opening it marks their messages as read. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const waId = indianMobile(req.nextUrl.searchParams.get("with"));
    if (!waId) return jsonError("Which number?", "BAD_REQUEST", 400);
    const who = await findCounterpart(user.organizationId, waId);
    if (!canSeeChat(user.role, who.kind)) return jsonError("You cannot open this chat", "FORBIDDEN", 403);
    const messages = await prisma.whatsAppMessage.findMany({ where: { organizationId: user.organizationId, waId }, orderBy: { createdAt: "asc" }, take: 500 });
    await prisma.whatsAppMessage.updateMany({ where: { organizationId: user.organizationId, waId, direction: "IN", readAt: null }, data: { readAt: new Date() } });
    const lastIn = await lastIncomingAt(user.organizationId, waId);
    const party = who.partyId ? await prisma.party.findUnique({ where: { id: who.partyId }, select: { whatsappGroupLink: true } }) : null;
    return jsonSuccess({
      with: { waId, ...who, groupLink: party?.whatsappGroupLink ?? null },
      messages,
      windowOpen: replyWindowOpen(lastIn),
      windowEndsAt: lastIn ? new Date(lastIn.getTime() + REPLY_WINDOW_MS) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({ to: z.string().min(10).max(20), text: z.string().trim().min(1).max(4000) });

/** A typed reply. Only within 24 hours of their last message (WhatsApp's rule). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const body = schema.parse(await req.json());
    const waId = indianMobile(body.to);
    if (!waId) return jsonError("Not a valid Indian mobile number", "BAD_REQUEST", 400);
    const who = await findCounterpart(user.organizationId, waId);
    if (!canSeeChat(user.role, who.kind)) return jsonError("You cannot write in this chat", "FORBIDDEN", 403);
    const message = await sendChatText(user.organizationId, { to: waId, text: body.text, sentById: user.userId });
    return jsonSuccess({ message }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
