import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { MeasurementBookService } from "@/services/measurement-book-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createEntrySchema = z.object({
  action: z.enum(["CREATE", "UPDATE_STATUS", "CONVERT_TO_BILL"]).default("CREATE"),
  // Fields for CREATE
  projectId: z.string().min(1).optional(),
  partyId: z.string().min(1).optional(),
  itemDescription: z.string().min(2).optional(),
  unit: z.string().min(1).optional(),
  count: z.number().positive().optional(),
  length: z.number().positive().optional(),
  breadth: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  agreedRate: z.number().positive().optional(), // paise
  notes: z.string().optional(),

  // Fields for UPDATE_STATUS
  entryId: z.string().min(1).optional(),
  status: z.enum(["VERIFIED", "APPROVED", "REJECTED"]).optional(),

  // Fields for CONVERT_TO_BILL
  billNumber: z.string().min(1).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") || undefined;
    const partyId = searchParams.get("partyId") || undefined;
    const status = searchParams.get("status") || undefined;

    const entries = await MeasurementBookService.listEntries(user.organizationId, {
      projectId,
      partyId,
      status,
    });

    return jsonSuccess(entries);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = createEntrySchema.parse(body);

    if (data.action === "CREATE") {
      if (!data.projectId || !data.partyId || !data.itemDescription || !data.unit || !data.agreedRate) {
        return jsonError("Missing required measurement fields", "INVALID_INPUT", 400);
      }

      const entry = await MeasurementBookService.createEntry({
        organizationId: user.organizationId,
        projectId: data.projectId,
        partyId: data.partyId,
        itemDescription: data.itemDescription,
        unit: data.unit,
        count: data.count,
        length: data.length,
        breadth: data.breadth,
        depth: data.depth,
        agreedRate: data.agreedRate,
        notes: data.notes,
        userId: user.userId,
        role: user.role,
      });

      return jsonSuccess(entry, 201);
    }

    if (data.action === "UPDATE_STATUS") {
      if (!data.entryId || !data.status) {
        return jsonError("entryId and status are required", "INVALID_INPUT", 400);
      }

      const updated = await MeasurementBookService.updateStatus({
        organizationId: user.organizationId,
        entryId: data.entryId,
        status: data.status,
        notes: data.notes,
        userId: user.userId,
        role: user.role,
      });

      return jsonSuccess(updated);
    }

    if (data.action === "CONVERT_TO_BILL") {
      if (!data.entryId || !data.billNumber) {
        return jsonError("entryId and billNumber are required", "INVALID_INPUT", 400);
      }

      const result = await MeasurementBookService.convertToBill({
        organizationId: user.organizationId,
        entryId: data.entryId,
        billNumber: data.billNumber,
        userId: user.userId,
        role: user.role,
      });

      return jsonSuccess(result, 201);
    }

    return jsonError("Unsupported action", "BAD_REQUEST", 400);
  } catch (error) {
    return handleApiError(error);
  }
}
