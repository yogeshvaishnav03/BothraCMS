import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createQuotationSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  vendorPartyId: z.string().min(1, "Vendor/Supplier is required"),
  unitCode: z.string().min(1, "Unit of measure is required"),
  baseRate: z.number().positive("Base rate must be greater than 0"),
  taxRatePercent: z.number().min(0).default(18),
  additionalCharges: z.number().min(0).default(0),
  quotationDate: z.string().min(1, "Quotation date is required"),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);

    const { searchParams } = new URL(req.url);
    const materialId = searchParams.get("materialId") || undefined;
    const vendorPartyId = searchParams.get("vendorPartyId") || undefined;
    const search = searchParams.get("search")?.toLowerCase().trim() || "";

    const where: any = {
      organizationId: user.organizationId,
      isArchived: false,
    };

    if (materialId) where.materialId = materialId;
    if (vendorPartyId) where.vendorPartyId = vendorPartyId;

    const quotations = await prisma.materialQuotation.findMany({
      where,
      include: {
        material: {
          include: { category: true },
        },
        vendor: {
          select: {
            id: true,
            name: true,
            contactPerson: true,
            phone: true,
            whatsappNumber: true,
            city: true,
            rating: true,
          },
        },
        creator: {
          select: { id: true, name: true, role: true },
        },
        attachments: {
          where: { isArchived: false },
          select: {
            id: true,
            fileId: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            category: true,
          },
        },
      },
      orderBy: [{ quotationDate: "desc" }, { createdAt: "desc" }],
    });

    // Determine the lowest total rate per material
    const minRatePerMaterial = new Map<string, number>();
    for (const q of quotations) {
      const currentMin = minRatePerMaterial.get(q.materialId);
      if (currentMin === undefined || q.totalRatePaise < currentMin) {
        minRatePerMaterial.set(q.materialId, q.totalRatePaise);
      }
    }

    const data = quotations
      .map((q: any) => {
        const isLowest = minRatePerMaterial.get(q.materialId) === q.totalRatePaise;
        const baseRate = q.ratePaise / 100;
        const taxAmount = q.taxAmountPaise / 100;
        const additionalCharges = q.additionalPaise / 100;
        const totalLandingRate = q.totalRatePaise / 100;

        return {
          id: q.id,
          materialId: q.materialId,
          materialName: q.material?.name || "Material",
          materialSku: q.material?.sku || "—",
          materialCategory: q.material?.category?.name || "General",
          vendorId: q.vendorPartyId,
          vendorName: q.vendor?.name || "Vendor",
          vendorCity: q.vendor?.city || "",
          vendorPhone: q.vendor?.phone || q.vendor?.whatsappNumber || "",
          vendorRating: q.vendor?.rating || null,
          unitCode: q.unitCode || q.material?.unitCode || "UNIT",
          baseRate,
          taxRatePercent: q.taxRatePercent,
          taxAmount,
          additionalCharges,
          totalLandingRate,
          isLowestPrice: isLowest,
          quotationDate: q.quotationDate,
          validUntil: q.validUntil,
          notes: q.notes || "",
          createdBy: q.creator?.name || "Staff",
          attachments: q.attachments || [],
        };
      })
      .filter((q: any) => {
        if (!search) return true;
        return (
          q.materialName.toLowerCase().includes(search) ||
          q.materialSku.toLowerCase().includes(search) ||
          q.materialCategory.toLowerCase().includes(search) ||
          q.vendorName.toLowerCase().includes(search)
        );
      });

    return jsonSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const canManagePricing =
      user.role === "SUPER_ADMIN" ||
      user.role === "ORG_ADMIN" ||
      user.role === "ACCOUNTANT" ||
      user.role === "STOREKEEPER" ||
      user.role === "PROJECT_MANAGER" ||
      (user.permissions && (user.permissions.includes("inventory:adjust") || user.permissions.includes("finance:write")));

    if (!canManagePricing) {
      return jsonError("Forbidden: You lack permission to manage vendor quotations", "FORBIDDEN", 403);
    }

    const body = await req.json();
    const parsed = createQuotationSchema.parse(body);

    const baseRatePaise = Math.round(parsed.baseRate * 100);
    const taxAmountPaise = Math.round((baseRatePaise * parsed.taxRatePercent) / 100);
    const additionalPaise = Math.round(parsed.additionalCharges * 100);
    const totalRatePaise = baseRatePaise + taxAmountPaise + additionalPaise;

    const quotation = await prisma.materialQuotation.create({
      data: {
        organizationId: user.organizationId,
        materialId: parsed.materialId,
        vendorPartyId: parsed.vendorPartyId,
        unitCode: parsed.unitCode,
        ratePaise: baseRatePaise,
        taxRatePercent: parsed.taxRatePercent,
        taxAmountPaise,
        additionalPaise,
        totalRatePaise,
        quotationDate: parsed.quotationDate,
        validUntil: parsed.validUntil || null,
        notes: parsed.notes || null,
        createdBy: user.userId,
        ...(parsed.attachmentIds && parsed.attachmentIds.length > 0
          ? {
              attachments: {
                connect: parsed.attachmentIds.map((id) => ({ id })),
              },
            }
          : {}),
      },
      include: {
        material: true,
        vendor: true,
      },
    });

    return jsonSuccess(quotation, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const canManagePricing =
      user.role === "SUPER_ADMIN" ||
      user.role === "ORG_ADMIN" ||
      user.role === "ACCOUNTANT" ||
      user.role === "STOREKEEPER" ||
      user.role === "PROJECT_MANAGER" ||
      (user.permissions && (user.permissions.includes("inventory:adjust") || user.permissions.includes("finance:write")));

    if (!canManagePricing) {
      return jsonError("Forbidden: You lack permission to delete quotations", "FORBIDDEN", 403);
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return jsonError("Quotation ID is required", 400);
    }

    const quotation = await prisma.materialQuotation.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!quotation) {
      return jsonError("Quotation not found", 404);
    }

    await prisma.materialQuotation.update({
      where: { id },
      data: { isArchived: true },
    });

    return jsonSuccess({ message: "Quotation deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
