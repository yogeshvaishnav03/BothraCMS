import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { notifyPeople } from "@/lib/notify";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);

    // Only Admins and Finance can approve out-of-pocket reimbursements
    const isApprover = ["SUPER_ADMIN", "ORG_ADMIN", "ACCOUNTANT"].includes(user.role);
    if (!isApprover) {
      return jsonError("Unauthorized: Only Admin or Finance can approve expense reimbursements", "FORBIDDEN", 403);
    }

    const { id } = params;
    const payment = await prisma.payment.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        recipientType: "OUT_OF_POCKET",
      },
    });

    if (!payment) {
      return jsonError("Cash expense claim not found", "NOT_FOUND", 404);
    }

    if (payment.status === "POSTED") {
      return jsonError("Expense claim is already approved", "ALREADY_APPROVED", 400);
    }

    const approverName = `${user.name} (${user.role.replace("_", " ")})`;

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "POSTED",
        approvedBy: approverName,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    });

    // Notify the supervisor that their expense claim was approved
    try {
      await notifyPeople({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        userIds: [payment.createdBy],
        type: "PAYMENT_APPROVAL",
        title: "Expense Claim Approved",
        message: `Your cash expense claim for ₹${Math.round(payment.amount / 100).toLocaleString(
          "en-IN"
        )} has been approved for reimbursement by ${approverName}.`,
        href: "/expenses",
        entityType: "PAYMENT",
        entityId: payment.id,
        severity: "INFO",
      });
    } catch (err) {
      console.warn("Approval notification failed:", err);
    }

    return jsonSuccess({
      id: updated.id,
      status: updated.status,
      approvedBy: updated.approvedBy,
      approvedAt: updated.approvedAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
