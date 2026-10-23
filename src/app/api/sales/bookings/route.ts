import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { DEFAULT_GST, PAYMENT_PLANS, SalesService } from "@/services/sales-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:read");
    const data = await SalesService.bookings(user);
    return jsonSuccess({ ...data, plans: Object.entries(PAYMENT_PLANS).map(([key, p]) => ({ key, ...p })), defaultGst: { ...DEFAULT_GST, OTHER: 5 } });
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({
  unitId: z.string().min(1),
  leadId: z.string().nullable().optional(),
  customerName: z.string().max(120).nullable().optional(),
  customerPhone: z.string().max(20).nullable().optional(),
  customerEmail: z.string().email().nullable().optional().or(z.literal("")),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  agreementValue: z.number().int().positive().max(1e13), // paise
  plan: z.string().min(1),
  gstRate: z.number().min(0).max(28).nullable().optional(),
});

/** Book a unit for a customer and create their payment schedule. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:write");
    return jsonSuccess(await SalesService.book(user, schema.parse(await req.json())), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
