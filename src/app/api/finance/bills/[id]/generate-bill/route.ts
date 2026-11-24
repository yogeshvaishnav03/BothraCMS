import { NextRequest } from "next/server";
import { z } from "zod";
import { COST_HEAD_KEYS } from "@/services/project-budget-service";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const generateBillSchema = z.object({
  billNumber: z.string().min(1).optional(),
  billDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  costHead: z.enum(COST_HEAD_KEYS).optional().nullable(),
  notes: z.string().optional(),
  gst: z
    .object({
      rate: z.number().min(0).max(28).nullable().optional(),
      interState: z.boolean().nullable().optional(),
      itcEligible: z.boolean().optional(),
      reverseCharge: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1),
        materialId: z.string().optional().nullable(),
        quantity: z.number().positive(),
        unitRate: z.number().nonnegative(), // in paise
        lineTotal: z.number().nonnegative(), // in paise
        gstRate: z.number().min(0).max(28).nullable().optional(),
      })
    )
    .min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");

    const body = await req.json();
    const data = generateBillSchema.parse(body);

    const bill = await FinanceService.generateBillFromChallan({
      organizationId: user.organizationId,
      billId: params.id,
      billNumber: data.billNumber,
      billDate: data.billDate ? new Date(data.billDate) : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      costHead: data.costHead,
      notes: data.notes,
      gst: data.gst,
      lines: data.lines,
      userId: user.userId,
      role: user.role,
      permissions: user.permissions,
    });

    return jsonSuccess({
      message: `Bill #${bill.billNumber} generated successfully`,
      bill,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
