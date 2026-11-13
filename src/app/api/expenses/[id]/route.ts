import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const updateExpenseSchema = z.object({
  title: z.string().min(2, "Expense title must be at least 2 characters"),
  amount: z.number().positive("Amount must be greater than zero"),
  expenseDate: z.string().min(1, "Expense date is required"),
  category: z.string().min(1, "Expense category is required"),
  paidTo: z.string().min(1, "Paid To (Shop or Person) is required"),
  paymentMode: z.enum(["PERSONAL_UPI", "PERSONAL_CASH", "PERSONAL_CARD"]),
  siteId: z.string().optional(),
  projectId: z.string().optional(),
  notes: z.string().optional(),
  receiptFileId: z.string().optional(),
  receiptFileName: z.string().optional(),
  receiptFileSize: z.number().optional(),
  receiptMimeType: z.string().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    const { id } = params;

    const payment = await prisma.payment.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        recipientType: "OUT_OF_POCKET",
      },
    });

    if (!payment) {
      return jsonError("Out-of-pocket expense not found", "NOT_FOUND", 404);
    }

    // Allow creator or privileged roles to update
    const isOwner = payment.createdBy === user.userId;
    const isPrivileged = ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "ACCOUNTANT", "SITE_SUPERVISOR"].includes(user.role);
    if (!isOwner && !isPrivileged) {
      return jsonError("Unauthorized to update this expense", "FORBIDDEN", 403);
    }

    const body = await req.json();
    const data = updateExpenseSchema.parse(body);

    const cleanTitle = data.title.trim();
    const cleanPaidTo = data.paidTo.trim();
    const amountPaise = Math.round(data.amount * 100);

    let targetProjectId = payment.projectId;
    if (data.siteId) {
      const siteProject = await prisma.project.findFirst({
        where: { siteId: data.siteId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (siteProject) {
        targetProjectId = siteProject.id;
      }
    } else if (data.projectId) {
      targetProjectId = data.projectId;
    }

    const method =
      data.paymentMode === "PERSONAL_UPI"
        ? "UPI"
        : data.paymentMode === "PERSONAL_CASH"
        ? "CASH"
        : "BANK_TRANSFER";

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        recipientName: cleanPaidTo,
        costHead: data.category,
        approvalQuery: `Out-of-Pocket Expense by ${user.name}: ${cleanTitle}`,
        notes: `[Out-of-Pocket Expense] ${cleanTitle} • Paid to: ${cleanPaidTo} (${data.paymentMode})${
          data.notes ? ` • ${data.notes.trim()}` : ""
        }`,
        method,
        paymentDate: new Date(data.expenseDate),
        amount: amountPaise,
        projectId: targetProjectId,
      },
      include: {
        project: {
          include: {
            site: true,
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
            role: true,
            email: true,
          },
        },
        attachments: true,
      },
    });

    // Link receipt attachment if provided
    if (data.receiptFileId) {
      const existingAtt = await prisma.attachment.findFirst({
        where: {
          fileId: data.receiptFileId,
          organizationId: user.organizationId,
        },
      });

      if (existingAtt) {
        await prisma.attachment.update({
          where: { id: existingAtt.id },
          data: {
            entityType: "PAYMENT",
            entityId: payment.id,
            paymentId: payment.id,
            category: "RECEIPT",
            projectId: targetProjectId,
            notes: `Out-of-pocket receipt for ${cleanTitle}`,
          },
        });
      } else {
        await prisma.attachment.create({
          data: {
            organizationId: user.organizationId,
            entityType: "PAYMENT",
            entityId: payment.id,
            paymentId: payment.id,
            fileId: data.receiptFileId,
            fileName: data.receiptFileName || "receipt-photo.jpg",
            fileSize: data.receiptFileSize || 1024,
            mimeType: data.receiptMimeType || "image/jpeg",
            diskFileName: data.receiptFileId,
            category: "RECEIPT",
            uploadedById: user.userId,
            projectId: targetProjectId,
            notes: `Out-of-pocket receipt for ${cleanTitle}`,
          },
        });
      }
    }

    return jsonSuccess({
      id: updated.id,
      referenceNumber: updated.referenceNumber,
      title: cleanTitle,
      amount: Math.round((updated.amount / 100) * 100) / 100,
      amountPaise: updated.amount,
      expenseDate: updated.paymentDate,
      category: updated.costHead || "OTHER",
      paidTo: updated.recipientName || "Vendor / Shop",
      paymentMode: data.paymentMode,
      payingAccount: updated.payingAccount,
      status: updated.status,
      notes: updated.notes,
      creator: updated.creator,
      project: updated.project ? { id: updated.project.id, name: updated.project.name, code: updated.project.code } : null,
      site: updated.project?.site || null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    const { id } = params;

    const payment = await prisma.payment.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        recipientType: "OUT_OF_POCKET",
      },
    });

    if (!payment) {
      return jsonError("Out-of-pocket expense not found", "NOT_FOUND", 404);
    }

    // Allow creator or privileged roles to delete
    const isOwner = payment.createdBy === user.userId;
    const isPrivileged = ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "ACCOUNTANT", "SITE_SUPERVISOR"].includes(user.role);
    if (!isOwner && !isPrivileged) {
      return jsonError("Unauthorized to delete this expense", "FORBIDDEN", 403);
    }

    // Delete linked attachments and payment allocations
    await prisma.attachment.deleteMany({
      where: {
        paymentId: payment.id,
        organizationId: user.organizationId,
      },
    }).catch(() => {});

    await prisma.paymentAllocation.deleteMany({
      where: { paymentId: payment.id },
    }).catch(() => {});

    await prisma.payment.delete({
      where: { id: payment.id },
    });

    return jsonSuccess({
      id: payment.id,
      deleted: true,
      message: "Out-of-pocket expense deleted successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
