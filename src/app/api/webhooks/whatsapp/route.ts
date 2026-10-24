import { NextRequest, NextResponse } from "next/server";
import { messagingSettings } from "@/lib/messaging";
import { handleWebhook, orgForPhoneNumberId, orgForVerifyToken, validSignature } from "@/services/whatsapp-inbox";

export const dynamic = "force-dynamic";

/** Meta checks the webhook address once, with the verify token from Settings → Messages. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get("hub.mode") === "subscribe" && (await orgForVerifyToken(q.get("hub.verify_token") || ""))) {
    return new NextResponse(q.get("hub.challenge") || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Replies and delivery updates from WhatsApp. Each call is signed with the
 * Meta app secret; anything unsigned is refused. Meta retries until it gets 200.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (body?.object !== "whatsapp_business_account") return NextResponse.json({ ok: true });

  let received = 0;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const orgId = await orgForPhoneNumberId(String(change.value?.metadata?.phone_number_id || ""));
      if (!orgId) continue;
      const s = await messagingSettings(orgId);
      const secret = s.waAppSecret || process.env.WHATSAPP_APP_SECRET || "";
      if (!validSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
        return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 401 });
      }
      try {
        received += (await handleWebhook(orgId, change.value)).received;
      } catch (e) {
        console.error("[WHATSAPP_WEBHOOK]", e);
        return NextResponse.json({ ok: false }, { status: 500 });
      }
    }
  }
  return NextResponse.json({ ok: true, received });
}
