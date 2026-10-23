import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const updateOrgSchema = z.object({
  name: z.string().min(2).optional(),
  currency: z.enum(["INR", "USD", "EUR", "GBP", "AED"]).optional(),
  timezone: z.string().min(2).optional(),
  settings: z
    .object({
      taxId: z.string().optional(),
      tan: z
        .string()
        .transform((v) => v.trim().toUpperCase())
        .refine((v) => v === "" || /^[A-Z]{4}\d{5}[A-Z]$/.test(v), "TAN looks wrong: 4 letters, 5 digits, 1 letter")
        .optional(),
      companyAddress: z.string().optional(),
      // Turnover last year over ₹10 crore: TDS on large purchases of goods (194Q) applies.
      tds194Q: z.boolean().optional(),
      // The person who signs TDS certificates (Form 16A), and their designation.
      tdsSignatory: z.string().trim().max(80).optional(),
      tdsSignatoryDesignation: z.string().trim().max(60).optional(),
      phone: z.string().optional(),
      lowStockThresholdMultiplier: z.number().min(0.5).max(5).optional(),
      workDayHours: z.number().min(4).max(16).optional(),
      language: z.string().optional(),
    })
    .optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: {
            sites: true,
            projects: true,
            workforceMembers: true,
            materials: true,
            bills: true,
          },
        },
      },
    });

    if (!organization) {
      return jsonError("Organization not found", "NOT_FOUND", 404);
    }

    let parsedSettings = {};
    if (organization.settingsJson) {
      try {
        parsedSettings = JSON.parse(organization.settingsJson);
      } catch {
        parsedSettings = {};
      }
    }

    // WhatsApp, SMS and Razorpay keys stay on the server; Settings → Messages and Online payments have their own routes.
    const { messaging: _messaging, payments: _payments, ...settings } = parsedSettings as any;
    return jsonSuccess({
      ...organization,
      settingsJson: undefined,
      settings,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    // Only ORG_ADMIN or SUPER_ADMIN can modify organization settings
    assertPermission(user.role, "users:manage");

    const body = await req.json();
    const data = updateOrgSchema.parse(body);

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

    const mergedSettings = data.settings
      ? { ...currentSettings, ...data.settings }
      : currentSettings;

    const updated = await prisma.$transaction(async (tx: any) => {
      const saved = await tx.organization.update({
        where: { id: user.organizationId },
        data: {
          name: data.name ?? org.name,
          currency: data.currency ?? org.currency,
          timezone: data.timezone ?? org.timezone,
          settingsJson: JSON.stringify(mergedSettings),
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: "ORGANIZATION_SETTINGS_UPDATED",
          entityType: "ORGANIZATION",
          entityId: saved.id,
          afterJson: JSON.stringify({
            name: saved.name,
            currency: saved.currency,
            timezone: saved.timezone,
            settings: { ...mergedSettings, messaging: undefined, payments: undefined },
          }),
        },
      });

      return saved;
    });

    const { messaging: _messaging, payments: _payments, ...settings } = mergedSettings;
    return jsonSuccess({
      ...updated,
      settingsJson: undefined,
      settings,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
