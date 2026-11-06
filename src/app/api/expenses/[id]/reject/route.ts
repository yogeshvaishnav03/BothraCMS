import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { notifyPeople } from "@/lib/notify";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const rejectSchema = z.object({
  rejectionReason: z.string().min(2, "Rejection reason is required"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);

    // Only Admins and Finance can reject out-of-pocket reimbursements
    const isApprover = ["SUPER_ADMIN", "ORG_ADMIN", "ACCOUNTANT"].includes(user.role);
    if (!isApprover) {
      return jsonError("Unauthorized: Only Admin or Finance can reject expense reimbursements", "FORBIDDEN", 403);
    }

    const body = await req.json();
    const data = rejectSchema.parse(body);

    const { id } = params;
    const payment = await prisma.payment.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        recipientType: "OUT_OF_POCKET",
      },
    });

    if (!payment) {
      return jsonError("Out-of-pocket expense claim not found", "NOT_FOUND", 404);
    }

    const approverName = `${user.name} (${user.role.replace("_", " ")})`;

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "REJECTED",
        rejectionReason: data.rejectionReason.trim(),
        approvedBy: approverName,
        approvedAt: new Date(),
      },
    });

    // Notify the supervisor with the rejection reason
    try {
      await notifyPeople({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        userIds: [payment.createdBy],
        type: "PAYMENT_APPROVAL",
        title: "Expense Claim Declined",
        message: `Your out-of-pocket expense claim for ₹${Math.round(payment.amount / 100).toLocaleString(
          "en-IN"
        )} was declined: ${data.rejectionReason.trim()}`,
        href: "/expenses",
        entityType: "PAYMENT",
        entityId: payment.id,
        severity: "WARNING",
      });
    } catch (err) {
      console.warn("Rejection notification failed:", err);
    }

    return jsonSuccess({
      id: updated.id,
      status: updated.status,
      rejectionReason: updated.rejectionReason,
      approvedBy: updated.approvedBy,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
