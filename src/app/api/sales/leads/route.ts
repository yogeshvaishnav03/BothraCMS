import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { LEAD_SOURCES, SalesService } from "@/services/sales-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:read");
    const sp = new URL(req.url).searchParams;
    return jsonSuccess(await SalesService.leads(user, { stage: sp.get("stage"), q: sp.get("q") }));
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^\+?[\d\s-]{10,16}$/, "Enter a valid phone number"),
  email: z.string().email().nullable().optional().or(z.literal("")),
  source: z.enum(LEAD_SOURCES),
  projectId: z.string().nullable().optional(),
  interest: z.string().max(200).nullable().optional(),
  budget: z.number().int().min(0).max(1e13).nullable().optional(), // paise
  nextFollowUp: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:write");
    return jsonSuccess(await SalesService.createLead(user, schema.parse(await req.json())), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
