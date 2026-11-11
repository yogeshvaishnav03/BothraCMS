import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { UserAdminService } from "@/services/user-admin-service";

export const dynamic = "force-dynamic";

const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  role: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  jobTitle: z.string().trim().max(80).nullable().optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  extraPermissions: z.array(z.string()).max(40).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req, "users:manage");
    const data = updateUserSchema.parse(await req.json());
    return jsonSuccess(await UserAdminService.update(user, params.id, data));
  } catch (error) {
    return handleApiError(error);
  }
}
