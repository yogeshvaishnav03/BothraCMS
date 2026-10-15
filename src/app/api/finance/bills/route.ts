import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createBillSchema = z.object({
  partyId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  billNumber: z.string().min(1),
  billDate: z.string(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(
    z.object({
      description: z.string().min(1),
      materialId: z.string().min(1).optional(),
      quantity: z.number().optional(),
      unitRate: z.number().optional(),
      lineTotal: z.number().positive(),
    })
  ).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const partyId = searchParams.get("partyId");

    const where: any = { organizationId: user.organizationId, status: "POSTED" };
    if (partyId) where.partyId = partyId;

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

    const enriched = bills.map((b) => {
      const paidAmount = b.allocations.reduce((sum, a) => sum + a.amount, 0);
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
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = createBillSchema.parse(body);

    const bill = await FinanceService.createBill({
      organizationId: user.organizationId,
      partyId: data.partyId,
      projectId: data.projectId,
      billNumber: data.billNumber,
      billDate: new Date(data.billDate),
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      notes: data.notes,
      lines: data.lines,
      userId: user.userId,
      role: user.role,
    });

    return jsonSuccess(bill, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
