import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { sendWhatsAppTemplate } from "@/lib/messaging";

export const dynamic = "force-dynamic";

/**
 * A test WhatsApp to check the set-up. Uses Meta's ready-made "hello_world"
 * template, which every new WhatsApp Business account has.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    const { phone } = z.object({ phone: z.string().min(10).max(20) }).parse(await req.json());
    const r = await sendWhatsAppTemplate(user.organizationId, { to: phone, template: "hello_world", params: [], language: "en_US", kind: "TEST", text: "Hello World (Meta's test message)" });
    return jsonSuccess(r);
  } catch (error) {
    return handleApiError(error);
  }
}
