import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { notifyPeople } from "@/lib/notify";
import { alertStaffNow } from "@/services/staff-alerts";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const ALLOWED_EXPENSE_ROLES = new Set([
  "SUPER_ADMIN",
  "ORG_ADMIN",
  "ACCOUNTANT",
  "SITE_SUPERVISOR",
  "PROJECT_MANAGER",
  "STOREKEEPER",
]);

const createExpenseSchema = z.object({
  title: z.string().min(2, "Expense title must be at least 2 characters"),
  amount: z.number().positive("Amount must be greater than zero"),
  expenseDate: z.string().min(1, "Expense date is required"),
  category: z.string().default("OTHER"),
  paidTo: z.string().min(1, "Recipient/Shop name is required"),
  paymentMode: z.enum(["PERSONAL_UPI", "PERSONAL_CASH", "PERSONAL_CARD", "OTHER"]).default("PERSONAL_UPI"),
  siteId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Receipt photo is MANDATORY as per business policy
  receiptFileId: z.string().min(1, "Receipt photo attachment is mandatory for out-of-pocket claims"),
  receiptFileName: z.string().optional().nullable(),
  receiptFileSize: z.number().optional().nullable(),
  receiptMimeType: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    if (!ALLOWED_EXPENSE_ROLES.has(user.role)) {
      return jsonError("Unauthorized: Role cannot view expenses", "FORBIDDEN", 403);
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const siteId = searchParams.get("siteId");
    const projectId = searchParams.get("projectId");
    const search = searchParams.get("search")?.toLowerCase().trim();
    const mineOnly = searchParams.get("mineOnly") === "true";
    const allTenants = searchParams.get("allTenants") === "true" && user.role === "SUPER_ADMIN";

    const where: any = {
      recipientType: "OUT_OF_POCKET",
      isArchived: false,
    };

    if (!allTenants) {
      where.organizationId = user.organizationId;
    }

    // Role-based visibility scoping:
    // - SUPER_ADMIN, ORG_ADMIN, ACCOUNTANT: see all org expenses
    // - SITE_SUPERVISOR, PROJECT_MANAGER: see own expenses, or when filtering by their site
    const isExecutive = ["SUPER_ADMIN", "ORG_ADMIN", "ACCOUNTANT"].includes(user.role);
    if (mineOnly || (!isExecutive && !siteId && !projectId)) {
      where.createdBy = user.userId;
    }

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (projectId) {
      where.projectId = projectId;
    } else if (siteId) {
      where.project = { siteId };
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, role: true, email: true } },
        project: {
          select: {
            id: true,
            name: true,
            code: true,
            siteId: true,
            site: { select: { id: true, name: true, code: true } },
          },
        },
        attachments: {
          where: { isArchived: false },
          select: {
            id: true,
            fileId: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            category: true,
            createdAt: true,
          },
        },
      },
      orderBy: { paymentDate: "desc" },
      take: 200,
    });

    let mapped = payments.map((p) => {
      const receipt = p.attachments.find((a) => a.category === "RECEIPT") || p.attachments[0] || null;
      return {
        id: p.id,
        referenceNumber: p.referenceNumber,
        title:
          p.approvalQuery?.replace(/^Out-of-Pocket Expense by [^:]+:\s*/i, "") ||
          p.notes?.replace(/^\[Out-of-Pocket Expense\]\s*/i, "").split("•")[0]?.trim() ||
          "Out-of-Pocket Site Expense",
        amount: Math.round((p.amount / 100) * 100) / 100, // Rupees
        amountPaise: p.amount,
        expenseDate: p.paymentDate,
        category: p.costHead || "OTHER",
        paidTo: p.recipientName || "Vendor / Shop",
        paymentMode: p.method === "UPI" ? "PERSONAL_UPI" : p.method === "CASH" ? "PERSONAL_CASH" : "PERSONAL_CARD",
        payingAccount: p.payingAccount,
        status: p.status, // "PENDING_APPROVAL", "POSTED", "REJECTED"
        approvedBy: p.approvedBy,
        approvedAt: p.approvedAt,
        rejectionReason: p.rejectionReason,
        notes: p.notes,
        creator: p.creator,
        project: p.project ? { id: p.project.id, name: p.project.name, code: p.project.code } : null,
        site: p.project?.site || null,
        receipt: receipt
          ? {
              id: receipt.id,
              fileId: receipt.fileId,
              fileName: receipt.fileName,
              fileSize: receipt.fileSize,
              mimeType: receipt.mimeType,
              url: `/api/uploads/${receipt.fileId}`,
            }
          : null,
        attachments: p.attachments.map((a) => ({
          ...a,
          url: `/api/uploads/${a.fileId}`,
        })),
        createdAt: p.createdAt,
      };
    });

    if (search) {
      mapped = mapped.filter(
        (m) =>
          m.title.toLowerCase().includes(search) ||
          m.paidTo.toLowerCase().includes(search) ||
          m.referenceNumber.toLowerCase().includes(search) ||
          m.creator?.name?.toLowerCase().includes(search) ||
          m.project?.name?.toLowerCase().includes(search) ||
          m.site?.name?.toLowerCase().includes(search)
      );
    }

    return jsonSuccess(mapped);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    if (!ALLOWED_EXPENSE_ROLES.has(user.role)) {
      return jsonError("Unauthorized: Role cannot log out-of-pocket expenses", "FORBIDDEN", 403);
    }

    const body = await req.json();

    // STRICT MANDATORY VALIDATION: Receipt photo must be present
    if (!body.receiptFileId || typeof body.receiptFileId !== "string" || !body.receiptFileId.trim()) {
      return jsonError(
        "Attaching a photo of the receipt or invoice bill is mandatory for out-of-pocket expenses",
        "RECEIPT_MANDATORY",
        400
      );
    }

    const data = createExpenseSchema.parse(body);

    // Resolve project and site
    let targetProjectId = data.projectId || undefined;
    if (!targetProjectId && data.siteId) {
      const siteProject = await prisma.project.findFirst({
        where: { siteId: data.siteId, organizationId: user.organizationId },
        select: { id: true },
      });
      targetProjectId = siteProject?.id;
    }

    // Convert Rupees to paise
    const amountPaise = Math.round(data.amount * 100);
    const refNum = `OOP-${Date.now().toString().slice(-6)}`;
    const idempotencyKey = `oop-${user.userId}-${Date.now()}`;

    const method =
      data.paymentMode === "PERSONAL_UPI"
        ? "UPI"
        : data.paymentMode === "PERSONAL_CASH"
        ? "CASH"
        : "BANK_TRANSFER";

    const cleanTitle = data.title.trim();
    const cleanPaidTo = data.paidTo.trim();

    // Create Payment record with recipientType = "OUT_OF_POCKET"
    const payment = await prisma.payment.create({
      data: {
        organizationId: user.organizationId,
        recipientType: "OUT_OF_POCKET",
        recipientName: cleanPaidTo,
        payingAccount: "Supervisor Out-of-Pocket",
        costHead: data.category,
        approvalQuery: `Out-of-Pocket Expense by ${user.name}: ${cleanTitle} (₹${data.amount.toLocaleString("en-IN")})`,
        notes: `[Out-of-Pocket Expense] ${cleanTitle} • Paid to: ${cleanPaidTo} (${data.paymentMode})${
          data.notes ? ` • ${data.notes.trim()}` : ""
        }`,
        method,
        referenceNumber: refNum,
        idempotencyKey,
        status: "PENDING_APPROVAL",
        paymentDate: new Date(data.expenseDate),
        amount: amountPaise,
        projectId: targetProjectId,
        createdBy: user.userId,
      },
    });

    // Ensure Attachment record is linked to this payment
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
          notes: `Out-of-pocket receipt for ${cleanTitle} (₹${data.amount})`,
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
          notes: `Out-of-pocket receipt for ${cleanTitle} (₹${data.amount})`,
        },
      });
    }

    // Notify Admins & Finance accountants
    try {
      const accountants = await prisma.user.findMany({
        where: {
          organizationId: user.organizationId,
          status: "ACTIVE",
          role: "ACCOUNTANT",
        },
        select: { id: true },
      });
      const accountantIds = accountants.map((a) => a.id);

      await notifyPeople({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        userIds: accountantIds,
        includeAdmins: true,
        type: "PAYMENT_APPROVAL",
        title: `Out-of-Pocket Expense Claim: ₹${data.amount.toLocaleString("en-IN")}`,
        message: `${user.name} (${user.role.replace("_", " ")}) logged an out-of-pocket expense for "${cleanTitle}". Receipt attached for verification.`,
        href: "/expenses",
        entityType: "PAYMENT",
        entityId: payment.id,
        severity: "INFO",
      });

      await alertStaffNow(user.organizationId);
    } catch (notifErr) {
      console.warn("Out-of-pocket expense notification warning:", notifErr);
    }

    return jsonSuccess(
      {
        id: payment.id,
        referenceNumber: payment.referenceNumber,
        title: cleanTitle,
        amount: data.amount,
        amountPaise,
        status: payment.status,
        receiptUrl: `/api/uploads/${data.receiptFileId}`,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
