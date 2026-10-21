import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext, verifyPassword, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters long"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirm password do not match",
    path: ["confirmPassword"],
  });

export async function POST(req: NextRequest) {
  const user = await getUserContext(req);
  if (!user) {
    return jsonError("Unauthorized", "UNAUTHORIZED", 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON request body", "INVALID_BODY", 400);
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
    return jsonError(errorMsg, "VALIDATION_ERROR", 400);
  }

  const { currentPassword, newPassword } = parsed.data;

  // Retrieve user record with current password hash
  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
  });

  if (!dbUser || dbUser.status !== "ACTIVE") {
    return jsonError("User account not found or inactive", "USER_NOT_FOUND", 404);
  }

  // Verify current password
  const isMatch = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!isMatch) {
    return jsonError("Current password is incorrect", "INVALID_CURRENT_PASSWORD", 400);
  }

  // Prevent reusing the exact same password
  const isSame = await verifyPassword(newPassword, dbUser.passwordHash);
  if (isSame) {
    return jsonError("New password must be different from current password", "PASSWORD_REUSED", 400);
  }

  // Hash new password
  const newHash = await hashPassword(newPassword);

  // Update password in database
  await prisma.user.update({
    where: { id: user.userId },
    data: { passwordHash: newHash },
  });

  // Record audit log event
  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "PASSWORD_CHANGED",
        entityType: "User",
        entityId: user.userId,
        reason: "User updated their account password via Settings",
      },
    });
  } catch (err) {
    console.error("Failed to write audit event for password change:", err);
  }

  return jsonSuccess({
    message: "Password changed successfully",
  });
}
