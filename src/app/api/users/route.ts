import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
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
  extraPermissions: z.array(z.string()).max(40).optional(),
  assignedSiteIds: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    if (user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN" || (user.role as string) === "ADMIN") {
      return jsonSuccess(await UserAdminService.list(user));
    }

    // For Project Managers, Supervisors, and staff: return active organization users for task assignments
    const activeUsers = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        jobTitle: true,
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return jsonSuccess({ employees: activeUsers });
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
