import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { MeasurementBookService } from "@/services/measurement-book-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reviewerComments: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = reviewSchema.parse(body);

    const result = await MeasurementBookService.reviewChangeRequest({
      organizationId: user.organizationId,
      requestId: params.id,
      action: data.action,
      reviewerComments: data.reviewerComments,
      userId: user.userId,
      userName: (user as any).name || (user as any).email || "Reviewer",
      role: user.role,
    });

    return jsonSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
