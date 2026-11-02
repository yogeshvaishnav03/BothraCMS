import { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { UserAdminService } from "@/services/user-admin-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req, "users:manage");
    let customPassword: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.password === "string" && body.password.trim()) {
        customPassword = body.password.trim();
      }
    } catch {
      // Optional body
    }
    return jsonSuccess(await UserAdminService.resetPassword(user, params.id, customPassword));
  } catch (error) {
    return handleApiError(error);
  }
}
