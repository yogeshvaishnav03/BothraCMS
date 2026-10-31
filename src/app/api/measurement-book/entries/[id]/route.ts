import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { MeasurementBookService } from "@/services/measurement-book-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const updateEntrySchema = z.object({
  reason: z.string().min(3, "Mandatory reason must be at least 3 characters"),
  entryName: z.string().optional(),
  itemDescription: z.string().optional(),
  measurementType: z.string().optional(),
  formula: z.string().optional(),
  unit: z.string().optional(),
  count: z.number().positive().optional(),
  length: z.number().nonnegative().optional(),
  breadth: z.number().nonnegative().nullable().optional(),
  depth: z.number().nonnegative().nullable().optional(),
  deduction: z.number().nonnegative().optional(),
  agreedRate: z.number().positive().optional(),
  notes: z.string().optional(),
  remarks: z.string().optional(),
  subgroupId: z.string().optional(),
  measurementDate: z.string().optional(),
});

const deleteEntrySchema = z.object({
  reason: z.string().min(3, "Mandatory reason must be at least 3 characters"),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const entry = await prisma.measurementBookEntry.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
      include: {
        project: { select: { id: true, name: true, code: true, siteId: true, site: { select: { id: true, name: true } } } },
        party: { select: { id: true, name: true, partyType: true } },
        group: { select: { id: true, name: true } },
        subgroup: { select: { id: true, name: true, type: true } },
        attachments: { orderBy: { createdAt: "desc" } },
        history: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!entry) return jsonError("Entry not found", "NOT_FOUND", 404);

    return jsonSuccess(entry);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = updateEntrySchema.parse(body);

    const result = await MeasurementBookService.updateEntryWithReason({
      organizationId: user.organizationId,
      entryId: params.id,
      reason: data.reason,
      updates: {
        entryName: data.entryName,
        itemDescription: data.itemDescription,
        measurementType: data.measurementType,
        formula: data.formula,
        unit: data.unit,
        count: data.count,
        length: data.length,
        breadth: data.breadth,
        depth: data.depth,
        deduction: data.deduction,
        agreedRate: data.agreedRate,
        notes: data.notes,
        remarks: data.remarks,
        subgroupId: data.subgroupId,
        measurementDate: data.measurementDate,
      },
      userId: user.userId,
      userName: (user as any).name || (user as any).email || "User",
      role: user.role,
    });

    return jsonSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = deleteEntrySchema.parse(body);

    const result = await MeasurementBookService.deleteEntryWithReason({
      organizationId: user.organizationId,
      entryId: params.id,
      reason: data.reason,
      userId: user.userId,
      userName: (user as any).name || (user as any).email || "User",
      role: user.role,
    });

    return jsonSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
