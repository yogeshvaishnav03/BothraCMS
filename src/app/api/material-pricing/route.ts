import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { rankQuotations, computeLandingPaise } from "@/lib/material-pricing";

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

// One material, several vendors' rates in one save.
const vendorRateSchema = z.object({
  vendorPartyId: z.string().min(1, "Vendor/Supplier is required"),
  baseRate: z.number().positive("Base rate must be greater than 0"),
  taxRatePercent: z.number().min(0).default(18),
  additionalCharges: z.number().min(0).default(0),
  notes: z.string().optional(),
});

const bulkQuotationSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  unitCode: z.string().min(1, "Unit of measure is required"),
  quotationDate: z.string().min(1, "Quotation date is required"),
  validUntil: z.string().optional(),
  rates: z.array(vendorRateSchema).min(1, "Add at least one vendor rate").max(50),
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

    const todayStr = new Date().toISOString().slice(0, 10);
    const rankings = rankQuotations(quotations as any[], todayStr);

    const data = quotations
      .map((q: any) => {
        const r = rankings.get(q.id)!;
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
          isLowestPrice: r.rank === 1,
          rank: r.rank,
          rankedVendorCount: r.rankedVendorCount,
          isCurrent: r.isCurrent,
          isExpired: r.isExpired,
          diffFromL1: r.diffFromL1Paise === null ? null : r.diffFromL1Paise / 100,
          diffFromL1Percent: r.diffFromL1Percent,
          quotationDate: q.quotationDate,
          validUntil: q.validUntil,
          notes: q.notes || "",
          createdAt: q.createdAt,
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

    // Accept either a single quote or { materialId, unitCode, rates: [...] }
    const bulk = Array.isArray(body?.rates)
      ? bulkQuotationSchema.parse(body)
      : (() => {
          const one = createQuotationSchema.parse(body);
          return {
            materialId: one.materialId,
            unitCode: one.unitCode,
            quotationDate: one.quotationDate,
            validUntil: one.validUntil,
            attachmentIds: one.attachmentIds,
            rates: [
              {
                vendorPartyId: one.vendorPartyId,
                baseRate: one.baseRate,
                taxRatePercent: one.taxRatePercent,
                additionalCharges: one.additionalCharges,
                notes: one.notes,
              },
            ],
          };
        })();

    const vendorIds = Array.from(new Set(bulk.rates.map((r) => r.vendorPartyId)));
    if (vendorIds.length !== bulk.rates.length) {
      return jsonError("Each vendor can appear only once per save", "VALIDATION_ERROR", 400);
    }

    // Material and vendors must belong to this organisation
    const [material, vendors] = await Promise.all([
      prisma.material.findFirst({
        where: { id: bulk.materialId, organizationId: user.organizationId },
        select: { id: true },
      }),
      prisma.party.findMany({
        where: { id: { in: vendorIds }, organizationId: user.organizationId },
        select: { id: true },
      }),
    ]);
    if (!material) return jsonError("Material not found", "NOT_FOUND", 404);
    if (vendors.length !== vendorIds.length) return jsonError("Vendor not found", "NOT_FOUND", 404);

    const unitCode = bulk.unitCode.trim().toUpperCase();

    const created = await prisma.$transaction(
      bulk.rates.map((r, idx) => {
        const paise = computeLandingPaise(r.baseRate, r.taxRatePercent, r.additionalCharges);
        return prisma.materialQuotation.create({
          data: {
            organizationId: user.organizationId,
            materialId: bulk.materialId,
            vendorPartyId: r.vendorPartyId,
            unitCode,
            ratePaise: paise.ratePaise,
            taxRatePercent: r.taxRatePercent,
            taxAmountPaise: paise.taxAmountPaise,
            additionalPaise: paise.additionalPaise,
            totalRatePaise: paise.totalRatePaise,
            quotationDate: bulk.quotationDate,
            validUntil: bulk.validUntil || null,
            notes: r.notes || null,
            createdBy: user.userId,
            // Attachments link to the first quote only (a file has one owner row)
            ...(idx === 0 && bulk.attachmentIds && bulk.attachmentIds.length > 0
              ? { attachments: { connect: bulk.attachmentIds.map((id) => ({ id })) } }
              : {}),
          },
        });
      })
    );

    return jsonSuccess(created.length === 1 ? created[0] : created, 201);
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
      return jsonError("Quotation ID is required", "BAD_REQUEST", 400);
    }

    const quotation = await prisma.materialQuotation.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!quotation) {
      return jsonError("Quotation not found", "NOT_FOUND", 404);
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
