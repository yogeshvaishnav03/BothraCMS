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
  receiptFileId: z.string().min(1, "Receipt photo attachment is mandatory for cash expenses"),
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
    // - Non-executives (SITE_SUPERVISOR, PROJECT_MANAGER, STOREKEEPER): see only their own expenses
    const isExecutive = ["SUPER_ADMIN", "ORG_ADMIN", "ACCOUNTANT"].includes(user.role);
    if (mineOnly || !isExecutive) {
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
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    let mapped = payments.map((p) => {
      const receipt = p.attachments.find((a) => a.category === "RECEIPT") || p.attachments[0] || null;
      return {
        id: p.id,
        referenceNumber: p.referenceNumber,
        title:
          p.approvalQuery
            ?.replace(/^(Out-of-Pocket|Cash) Expense by [^:]+:\s*/i, "")
            ?.replace(/\s*\([₹\s]*[0-9,.]+\)\s*$/i, "")
            ?.trim() ||
          p.notes?.replace(/^\[(Out-of-Pocket|Cash) Expense\]\s*/i, "").split("•")[0]?.trim() ||
          "Cash Site Expense",
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

    const res = jsonSuccess(mapped);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.headers.set("Pragma", "no-cache");
    return res;
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    if (!ALLOWED_EXPENSE_ROLES.has(user.role)) {
      return jsonError("Unauthorized: Role cannot log cash expenses", "FORBIDDEN", 403);
    }

    const body = await req.json();

    // STRICT MANDATORY VALIDATION: Receipt photo must be present
    if (!body.receiptFileId || typeof body.receiptFileId !== "string" || !body.receiptFileId.trim()) {
      return jsonError(
        "Attaching a photo of the receipt or invoice bill is mandatory for cash expenses",
        "RECEIPT_MANDATORY",
        400
      );
    }

    const data = createExpenseSchema.parse(body);

    // Resolve and tenant-scope project and site
    let targetProjectId = data.projectId || undefined;
    if (targetProjectId) {
      const project = await prisma.project.findFirst({
        where: { id: targetProjectId, organizationId: user.organizationId, isArchived: false },
        select: { id: true },
      });
      if (!project) {
        return jsonError("Project not found or outside organization scope", "PROJECT_NOT_FOUND", 404);
      }
    } else if (data.siteId) {
      const site = await prisma.site.findFirst({
        where: { id: data.siteId, organizationId: user.organizationId, status: "ACTIVE" },
        select: { id: true, name: true, code: true },
      });
      if (!site) {
        return jsonError("Site not found or outside organization scope", "SITE_NOT_FOUND", 404);
      }

      let siteProject = await prisma.project.findFirst({
        where: { siteId: site.id, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!siteProject) {
        siteProject = await prisma.project.create({
          data: {
            organizationId: user.organizationId,
            siteId: site.id,
            name: `${site.name} — General Operations`,
            code: `${site.code || "SITE"}-GEN`,
            status: "IN_PROGRESS",
          },
          select: { id: true },
        });
      }
      targetProjectId = siteProject.id;
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
        approvalQuery: `Cash Expense by ${user.name}: ${cleanTitle}`,
        notes: `[Cash Expense] ${cleanTitle} • Paid to: ${cleanPaidTo} (${data.paymentMode})${
          data.notes ? ` • ${data.notes.trim()}` : ""
        }`,
        method,
        referenceNumber: refNum,
        idempotencyKey,
        status: "POSTED",
        approvedBy: user.name,
        approvedAt: new Date(),
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
          notes: `Cash expense receipt for ${cleanTitle}`,
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
          notes: `Cash expense receipt for ${cleanTitle}`,
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
        title: `Cash Expense Claim: ₹${data.amount.toLocaleString("en-IN")}`,
        message: `${user.name} (${user.role.replace("_", " ")}) logged a cash expense for "${cleanTitle}". Receipt attached for verification.`,
        href: "/expenses",
        entityType: "PAYMENT",
        entityId: payment.id,
        severity: "INFO",
      });

      await alertStaffNow(user.organizationId);
    } catch (notifErr) {
      console.warn("Out-of-pocket expense notification warning:", notifErr);
    }

    // Fetch complete payment with relations for instant client-side state update
    const createdWithRelations = await prisma.payment.findUnique({
      where: { id: payment.id },
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
    });

    const receiptAtt = createdWithRelations?.attachments.find((a) => a.category === "RECEIPT") || createdWithRelations?.attachments[0] || null;

    const fullMapped = {
      id: payment.id,
      referenceNumber: payment.referenceNumber,
      title: cleanTitle,
      amount: data.amount,
      amountPaise,
      expenseDate: payment.paymentDate,
      category: data.category,
      paidTo: cleanPaidTo,
      paymentMode: data.paymentMode,
      payingAccount: payment.payingAccount,
      status: payment.status,
      approvedBy: payment.approvedBy,
      approvedAt: payment.approvedAt,
      rejectionReason: payment.rejectionReason,
      notes: payment.notes,
      creator: createdWithRelations?.creator || { id: user.userId, name: user.name, role: user.role, email: user.email },
      project: createdWithRelations?.project ? { id: createdWithRelations.project.id, name: createdWithRelations.project.name, code: createdWithRelations.project.code } : null,
      site: createdWithRelations?.project?.site || null,
      receipt: receiptAtt
        ? {
            id: receiptAtt.id,
            fileId: receiptAtt.fileId,
            fileName: receiptAtt.fileName,
            fileSize: receiptAtt.fileSize,
            mimeType: receiptAtt.mimeType,
            url: `/api/uploads/${receiptAtt.fileId}`,
          }
        : {
            id: data.receiptFileId,
            fileId: data.receiptFileId,
            fileName: data.receiptFileName || "receipt-photo.jpg",
            fileSize: data.receiptFileSize || 1024,
            mimeType: data.receiptMimeType || "image/jpeg",
            url: `/api/uploads/${data.receiptFileId}`,
          },
      attachments: (createdWithRelations?.attachments || []).map((a) => ({
        ...a,
        url: `/api/uploads/${a.fileId}`,
      })),
      createdAt: payment.createdAt,
    };

    return jsonSuccess(
      {
        id: payment.id,
        referenceNumber: payment.referenceNumber,
        title: cleanTitle,
        amount: data.amount,
        amountPaise,
        status: payment.status,
        receiptUrl: `/api/uploads/${data.receiptFileId}`,
        expense: fullMapped,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
