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
      companyAddress: z.string().optional(),
      phone: z.string().optional(),
      lowStockThresholdMultiplier: z.number().min(0.5).max(5).optional(),
      workDayHours: z.number().min(4).max(16).optional(),
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

    return jsonSuccess({
      ...organization,
      settings: parsedSettings,
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
            settings: mergedSettings,
          }),
        },
      });

      return saved;
    });

    return jsonSuccess({
      ...updated,
      settings: mergedSettings,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
