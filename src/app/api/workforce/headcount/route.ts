import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { WorkforceHeadcountService } from "@/services/workforce-headcount-service";

export const dynamic = "force-dynamic";

const saveHeadcountSchema = z.object({
  siteId: z.string().min(1, "Site is required"),
  date: z.string().min(8, "Date is required"),
  shift: z.enum(["GENERAL", "DAY", "NIGHT"]).default("GENERAL"),
  artisanMale: z.number().min(0).default(0),
  artisanFemale: z.number().min(0).default(0),
  craftsmanMale: z.number().min(0).default(0),
  craftsmanFemale: z.number().min(0).default(0),
  laborerMale: z.number().min(0).default(0),
  laborerFemale: z.number().min(0).default(0),
  contractorName: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId") || undefined;
    const date = searchParams.get("date") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const summary = searchParams.get("summary") === "true";

    if (summary) {
      const stats = await WorkforceHeadcountService.getSummary(user.organizationId, siteId, date);
      return jsonSuccess(stats);
    }

    const records = await WorkforceHeadcountService.listRecords(user.organizationId, {
      siteId,
      date,
      startDate,
      endDate,
    });

    return jsonSuccess(records);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user.role, "attendance:write");

    const body = await req.json();
    const data = saveHeadcountSchema.parse(body);

    const record = await WorkforceHeadcountService.saveRecord(user.organizationId, data, {
      userId: user.userId,
      name: user.name,
      role: user.role,
    });

    return jsonSuccess(record, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user.role, "attendance:write");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Record ID is required", "BAD_REQUEST", 400);

    const deleted = await WorkforceHeadcountService.deleteRecord(user.organizationId, id);
    if (!deleted) return jsonError("Record not found", "NOT_FOUND", 404);

    return jsonSuccess({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
