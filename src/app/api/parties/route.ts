import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission, canReadFinance } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { partyProfileSchema, pickProfileUpdates, publicPartyProfile } from "@/lib/party-profile";

export const dynamic = "force-dynamic";

const createPartySchema = partyProfileSchema.extend({
  name: z.string().min(2),
  partyType: z.enum(["VENDOR", "CONTRACTOR", "BOTH", "CLIENT", "OTHER"]).default("VENDOR"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  taxIdentifier: z.string().optional(),
  contractValue: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);

    const { searchParams } = new URL(req.url);
    const partyType = searchParams.get("type"); // VENDOR, CONTRACTOR, BOTH, ALL
    const includeArchived = searchParams.get("includeArchived") === "true";

    const where: any = { organizationId: user.organizationId };
    if (!includeArchived) {
      where.active = true;
      where.isArchived = false;
    }
    if (partyType && partyType !== "ALL") {
      where.partyType = { in: [partyType, "BOTH"] };
    }

    const hasFinanceAccess = canReadFinance(user);

    const parties = await prisma.party.findMany({
      where,
      include: hasFinanceAccess
        ? {
            bills: {
              where: { status: "POSTED", isArchived: false },
              include: { allocations: { where: { reversedAt: null } } },
            },
            payments: {
              where: { status: "POSTED", isArchived: false },
            },
          }
        : undefined,
      orderBy: { name: "asc" },
    });

    const enriched = parties.map((p: any) => {
      if (!hasFinanceAccess) {
        return {
          id: p.id,
          name: p.name,
          partyType: p.partyType,
          phone: p.phone,
          email: p.email,
          address: p.address,
          taxIdentifier: p.taxIdentifier,
          ...publicPartyProfile(p),
          notes: p.notes,
          active: p.active,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      }

      const totalBilled = (p.bills || []).reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);
      const totalPaid = (p.payments || []).reduce((sum: number, pay: any) => sum + (pay.amount || 0), 0);
      const outstandingBalance = totalBilled - totalPaid;

      return {
        id: p.id,
        name: p.name,
        partyType: p.partyType,
        phone: p.phone,
        email: p.email,
        address: p.address,
        taxIdentifier: p.taxIdentifier,
        ...publicPartyProfile(p),
        contractValue: p.contractValue || 0,
        totalBilled,
        totalPaid,
        outstandingBalance,
        notes: p.notes,
        active: p.active,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    return jsonSuccess(enriched);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");

    const body = await req.json();
    const data = createPartySchema.parse(body);

    const party = await prisma.party.create({
      data: {
        organizationId: user.organizationId,
        name: data.name.trim(),
        partyType: data.partyType,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        address: data.address?.trim() || null,
        taxIdentifier: data.taxIdentifier?.trim() || null,
        contractValue: data.contractValue || 0,
        notes: data.notes?.trim() || null,
        ...pickProfileUpdates(data),
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "PARTY_CREATED",
        entityType: "PARTY",
        entityId: party.id,
        afterJson: JSON.stringify({
          name: party.name,
          partyType: party.partyType,
          contractValue: party.contractValue,
        }),
        reason: `Created ${party.partyType.toLowerCase()} profile for ${party.name}`,
      },
    });

    const { bankAccountNumber: _acc, ...safeParty } = party;
    return jsonSuccess({ ...safeParty, ...publicPartyProfile(party) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Party ID is required", "BAD_REQUEST", 400);

    const party = await prisma.party.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!party) {
      return jsonError("Party not found", "NOT_FOUND", 404);
    }

    // Soft-delete / Archival to preserve transaction history
    await prisma.party.update({
      where: { id: party.id },
      data: {
        active: false,
        isArchived: true,
        archivedAt: new Date(),
        archivedById: user.userId,
        archiveReason: "Party profile archived by authorized user",
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "PARTY_ARCHIVED",
        entityType: "PARTY",
        entityId: party.id,
        beforeJson: JSON.stringify({ name: party.name, partyType: party.partyType, active: party.active }),
        afterJson: JSON.stringify({ active: false, isArchived: true }),
        reason: "Party archived while preserving historical bills and payment links",
      },
    });

    return jsonSuccess({ archived: true, deleted: true, id: party.id });
  } catch (error) {
    return handleApiError(error);
  }
}
