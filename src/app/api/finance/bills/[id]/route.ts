import { NextRequest } from "next/server";
import { z } from "zod";
import { COST_HEAD_KEYS } from "@/services/project-budget-service";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission, requireProjectAccess } from "@/lib/server-auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const updateBillSchema = z.object({
  partyId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional().nullable(),
  billNumber: z.string().min(1).optional(),
  billDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  costHead: z.enum(COST_HEAD_KEYS).optional().nullable(),
  notes: z.string().optional().nullable(),
  reason: z.string().min(5, "A detailed reason (minimum 5 characters) is required for modifying an official bill record"),
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
        materialId: z.string().min(1).optional().nullable(),
        quantity: z.number().optional().nullable(),
        unitRate: z.number().optional().nullable(),
        lineTotal: z.number().positive(),
        gstRate: z.number().min(0).max(28).nullable().optional(),
      })
    )
    .min(1)
    .optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:read");

    const bill = await prisma.bill.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
      include: {
        party: true,
        project: true,
        lines: { include: { material: true } },
        allocations: { where: { reversedAt: null }, include: { payment: true } },
      },
    });

    if (!bill) {
      return jsonError("Bill not found", "NOT_FOUND", 404);
    }

    if (bill.projectId) {
      await requireProjectAccess(user, bill.projectId, "finance:read");
    }

    const paidAmount = bill.allocations.reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
    const outstandingAmount = bill.totalAmount - paidAmount;

    return jsonSuccess({
      ...bill,
      paidAmount,
      outstandingAmount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return handleUpdate(req, params.id);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return handleUpdate(req, params.id);
}

async function handleUpdate(req: NextRequest, billId: string) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");

    const body = await req.json();
    const data = updateBillSchema.parse(body);

    if (data.projectId) {
      await requireProjectAccess(user, data.projectId, "finance:write");
    }

    const updated = await FinanceService.updateBill({
      organizationId: user.organizationId,
      billId,
      partyId: data.partyId,
      projectId: data.projectId || undefined,
      billNumber: data.billNumber,
      billDate: data.billDate ? new Date(data.billDate) : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      costHead: data.costHead,
      notes: data.notes || undefined,
      gst: data.gst,
      lines: data.lines as any,
      reason: data.reason,
      userId: user.userId,
      role: user.role,
    });

    return jsonSuccess({
      message: "Bill modified successfully with audit trail recorded",
      bill: updated,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
