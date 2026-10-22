import { NextRequest } from "next/server";
import { z } from "zod";
import { COST_HEAD_KEYS } from "@/services/project-budget-service";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission, requireProjectAccess } from "@/lib/server-auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createBillSchema = z.object({
  partyId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  billNumber: z.string().min(1),
  billDate: z.string(),
  dueDate: z.string().optional(),
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
  lines: z.array(
    z.object({
      description: z.string().min(1),
      materialId: z.string().min(1).optional(),
      quantity: z.number().optional(),
      unitRate: z.number().optional(),
      lineTotal: z.number().positive(),
      gstRate: z.number().min(0).max(28).nullable().optional(),
    })
  ).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:read");

    const { searchParams } = new URL(req.url);
    const partyId = searchParams.get("partyId");
    const projectId = searchParams.get("projectId");
    const includeArchived = searchParams.get("includeArchived") === "true";

    if (projectId) {
      await requireProjectAccess(user, projectId, "finance:read");
    }

    const where: any = { organizationId: user.organizationId, status: "POSTED" };
    if (!includeArchived) {
      where.isArchived = false;
    }
    if (partyId) where.partyId = partyId;
    if (projectId) where.projectId = projectId;

    const bills = await prisma.bill.findMany({
      where,
      include: {
        party: true,
        project: true,
        lines: { include: { material: true } },
        allocations: { where: { reversedAt: null } },
      },
      orderBy: { billDate: "desc" },
    });

    const enriched = bills.map((b: any) => {
      const paidAmount = b.allocations.reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
      const outstandingAmount = b.totalAmount - paidAmount;
      return {
        ...b,
        paidAmount,
        outstandingAmount,
      };
    });

    return jsonSuccess(enriched);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");

    const body = await req.json();
    const data = createBillSchema.parse(body);

    if (data.projectId) {
      await requireProjectAccess(user, data.projectId, "finance:write");
    }

    const bill = await FinanceService.createBill({
      organizationId: user.organizationId,
      partyId: data.partyId,
      projectId: data.projectId,
      billNumber: data.billNumber,
      billDate: new Date(data.billDate),
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      costHead: data.costHead,
      notes: data.notes,
      gst: data.gst,
      lines: data.lines,
      userId: user.userId,
      role: user.role,
    });

    return jsonSuccess(bill, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
