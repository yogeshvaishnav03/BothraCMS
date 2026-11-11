import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { MeasurementBookService } from "@/services/measurement-book-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const result = await MeasurementBookService.deleteSubgroup({
      organizationId: user.organizationId,
      subgroupId: params.id,
      role: user.role,
      permissions: user.permissions,
      userId: user.userId,
    });

    return jsonSuccess({
      message: "Room / Subgroup deleted successfully",
      ...result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
