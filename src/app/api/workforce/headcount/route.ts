import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { WorkforceHeadcountService } from "@/services/workforce-headcount-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const singleEntrySchema = z.object({
  id: z.string().optional(),
  siteId: z.string().min(1, "Site is required"),
  projectId: z.string().optional().nullable(),
  date: z.string().min(8, "Date is required"),
  shift: z.enum(["GENERAL", "DAY", "NIGHT"]).default("GENERAL"),
  source: z.enum(["CONTRACTOR", "DIRECT"]).default("CONTRACTOR"),
  contractorId: z.string().optional().nullable(),
  contractorName: z.string().optional().nullable(),
  artisanCount: z.number().min(0).default(0).optional(),
  skilledCount: z.number().min(0).default(0).optional(),
  craftsmanCount: z.number().min(0).default(0).optional(),
  laborerMale: z.number().min(0).default(0).optional(),
  maleCount: z.number().min(0).default(0).optional(),
  laborerFemale: z.number().min(0).default(0).optional(),
  femaleCount: z.number().min(0).default(0).optional(),
  skilledRate: z.number().min(0).default(0).optional(),
  skilledAmount: z.number().min(0).default(0).optional(),
  maleRate: z.number().min(0).default(0).optional(),
  maleAmount: z.number().min(0).default(0).optional(),
  femaleRate: z.number().min(0).default(0).optional(),
  femaleAmount: z.number().min(0).default(0).optional(),
  totalExpense: z.number().min(0).default(0).optional(),
  rateUnit: z.string().default("DAY").optional(),
  isOverridden: z.boolean().default(false).optional(),
  overrideReason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  artisanMale: z.number().min(0).default(0).optional(),
  artisanFemale: z.number().min(0).default(0).optional(),
  craftsmanMale: z.number().min(0).default(0).optional(),
  craftsmanFemale: z.number().min(0).default(0).optional(),
});

const bulkHeadcountPayloadSchema = z.union([
  z.object({
    entries: z.array(singleEntrySchema).min(1, "At least one entry is required"),
  }),
  z.array(singleEntrySchema).min(1, "At least one entry is required"),
  singleEntrySchema,
]);

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId") || undefined;
    const projectId = searchParams.get("projectId") || undefined;
    const date = searchParams.get("date") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const summary = searchParams.get("summary") === "true";
    const reports = searchParams.get("reports") === "true";
    const contractorQuery = searchParams.get("contractorRate");

    // Contractor rate card lookup
    if (contractorQuery) {
      const rateCard = await WorkforceHeadcountService.getContractorRates(
        user.organizationId,
        contractorQuery
      );
      return jsonSuccess(rateCard);
    }

    // Labour cost and financial expense reports
    if (reports) {
      const reportData = await WorkforceHeadcountService.getLabourExpenseReports(
        user.organizationId,
        { siteId, projectId, startDate, endDate }
      );
      return jsonSuccess(reportData);
    }

    if (summary) {
      const stats = await WorkforceHeadcountService.getSummary(user.organizationId, siteId, date);
      return jsonSuccess(stats);
    }

    const records = await WorkforceHeadcountService.listRecords(user.organizationId, {
      siteId,
      projectId,
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

    assertPermission(user, "attendance:write");

    const body = await req.json();
    const parsed = bulkHeadcountPayloadSchema.parse(body);

    let entriesToSave: z.infer<typeof singleEntrySchema>[];
    if (Array.isArray(parsed)) {
      entriesToSave = parsed;
    } else if ("entries" in parsed) {
      entriesToSave = parsed.entries;
    } else {
      entriesToSave = [parsed];
    }

    // Clean inputs for service
    const cleanEntries = entriesToSave.map((e) => ({
      ...e,
      projectId: e.projectId || undefined,
      contractorId: e.contractorId || undefined,
      contractorName: e.contractorName || undefined,
      overrideReason: e.overrideReason || undefined,
      notes: e.notes || undefined,
      artisanCount: e.artisanCount !== undefined ? e.artisanCount : e.skilledCount,
      laborerMale: e.laborerMale !== undefined ? e.laborerMale : e.maleCount || 0,
      laborerFemale: e.laborerFemale !== undefined ? e.laborerFemale : e.femaleCount || 0,
    }));

    const records = await WorkforceHeadcountService.saveBulkRecords(
      user.organizationId,
      cleanEntries as any,
      {
        userId: user.userId,
        name: user.name,
        role: user.role,
      }
    );

    // If single entry was submitted, return single record for backward compatibility
    if (!Array.isArray(parsed) && !("entries" in parsed)) {
      return jsonSuccess(records[0], 201);
    }

    return jsonSuccess({ entries: records, count: records.length }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user, "attendance:write");

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
