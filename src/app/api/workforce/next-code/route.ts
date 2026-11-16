import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { generateNextWorkerCode } from "@/services/workforce-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const nextCode = await generateNextWorkerCode(user.organizationId);
    return jsonSuccess({ nextCode });
  } catch (error) {
    return handleApiError(error);
  }
}
