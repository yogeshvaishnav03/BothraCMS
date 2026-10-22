import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { PayrollService } from "@/services/payroll-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  monthlySalary: z.number().int().min(0).max(1e11), // paise
  bankAccount: z.string().regex(/^\d{6,20}$/, "Account number should be 6 to 20 digits").nullable().optional(),
  ifsc: z.string().regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "IFSC looks wrong").nullable().optional(),
  pfApplicable: z.boolean().optional(),
  esiApplicable: z.boolean().optional(),
  uan: z.string().regex(/^\d{12}$/, "UAN is 12 digits").nullable().optional().or(z.literal("")),
  esicNumber: z.string().regex(/^\d{10,17}$/, "ESIC number should be 10 to 17 digits").nullable().optional().or(z.literal("")),
});

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:write");
    await PayrollService.saveProfile(user, params.userId, schema.parse(await req.json()));
    return jsonSuccess({ staff: await PayrollService.listProfiles(user.organizationId) });
  } catch (error) {
    return handleApiError(error);
  }
}
