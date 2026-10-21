import { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { UserAdminService } from "@/services/user-admin-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req, "users:manage");
    return jsonSuccess(await UserAdminService.resetPassword(user, params.id));
  } catch (error) {
    return handleApiError(error);
  }
}
