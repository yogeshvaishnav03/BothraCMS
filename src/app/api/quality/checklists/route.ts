import { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { CHECKLISTS } from "@/services/quality-safety-service";

export const dynamic = "force-dynamic";

/** The built-in quality and safety checklists. */
export async function GET(req: NextRequest) {
  try {
    await requireUserContext(req);
    return jsonSuccess(Object.entries(CHECKLISTS).map(([key, c]) => ({ key, ...c })));
  } catch (error) {
    return handleApiError(error);
  }
}
