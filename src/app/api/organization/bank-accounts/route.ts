import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { resolveCanonicalRole } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const bankAccountItemSchema = z.object({
  id: z.string().min(1),
  bankName: z.string().trim().min(1, "Bank name is required"),
  accountLast4: z
    .string()
    .trim()
    .min(1, "Last 4 digits are required")
    .max(10, "Account digits cannot exceed 10 characters"),
  accountHolder: z.string().trim().min(1, "Account holder name is required"),
});

const saveBankAccountsSchema = z.object({
  bankAccounts: z.array(bankAccountItemSchema),
});

/**
 * GET /api/organization/bank-accounts
 * Returns company bank accounts for the current organization.
 * Accessible to any authenticated organization member for populating payment/bill dropdowns.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { settingsJson: true },
    });

    if (!organization) {
      return jsonError("Organization not found", "NOT_FOUND", 404);
    }

    let parsedSettings: any = {};
    if (organization.settingsJson) {
      try {
        parsedSettings = JSON.parse(organization.settingsJson);
      } catch {
        parsedSettings = {};
      }
    }

    const bankAccounts = Array.isArray(parsedSettings?.bankAccounts)
      ? parsedSettings.bankAccounts
      : [];

    return jsonSuccess(bankAccounts);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/organization/bank-accounts
 * Saves/updates company bank accounts.
 * STRICTLY RESTRICTED TO SUPER_ADMIN.
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const userRole = resolveCanonicalRole(user.role);
    if (userRole !== "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") {
      return jsonError(
        "Forbidden: Only Super Admin can configure company bank accounts",
        "FORBIDDEN",
        403
      );
    }

    const body = await req.json();
    const { bankAccounts } = saveBankAccountsSchema.parse(body);

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
    });

    if (!org) {
      return jsonError("Organization not found", "NOT_FOUND", 404);
    }

    let currentSettings: any = {};
    if (org.settingsJson) {
      try {
        currentSettings = JSON.parse(org.settingsJson);
      } catch {
        currentSettings = {};
      }
    }

    const updatedSettings = {
      ...currentSettings,
      bankAccounts,
    };

    await prisma.$transaction(async (tx: any) => {
      await tx.organization.update({
        where: { id: user.organizationId },
        data: {
          settingsJson: JSON.stringify(updatedSettings),
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: "ORGANIZATION_BANK_ACCOUNTS_UPDATED",
          entityType: "ORGANIZATION",
          entityId: org.id,
          afterJson: JSON.stringify({ bankAccounts }),
        },
      });
    });

    return jsonSuccess(bankAccounts);
  } catch (error) {
    return handleApiError(error);
  }
}
