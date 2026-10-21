import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { UserAdminService } from "@/services/user-admin-service";

export const dynamic = "force-dynamic";

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Enter a valid email"),
  role: z.string().min(1),
  phone: z.string().trim().max(20).nullable().optional(),
  jobTitle: z.string().trim().max(80).nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req, "users:manage");
    return jsonSuccess(await UserAdminService.list(user));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req, "users:manage");
    const data = createUserSchema.parse(await req.json());
    const result = await UserAdminService.create(user, data);
    // The temporary password is shown once to the admin and never stored in plain text.
    return jsonSuccess(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
