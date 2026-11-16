import { prisma, getDirectPrisma, ensurePostgresColumns } from "./db";
import fs from "fs";
import path from "path";

let isSeeding = false;

export async function bootstrapWebsiteDataRuntime(): Promise<boolean> {
  if (isSeeding) return false;
  isSeeding = true;

  try {
    const client = getDirectPrisma() || prisma;
    await ensurePostgresColumns();

    const dataFilePath = path.resolve(process.cwd(), "data", "website-data.json");
    if (!fs.existsSync(dataFilePath)) {
      console.warn("[RUNTIME_SEEDER] website-data.json not found at:", dataFilePath);
      return false;
    }

    const raw = fs.readFileSync(dataFilePath, "utf8");
    const dataset = JSON.parse(raw);
    const orgData = dataset.organization;
    if (!orgData) return false;

    // 1. Organization
    await client.organization.upsert({
      where: { id: orgData.id },
      update: {
        name: orgData.name,
        currency: orgData.currency || "INR",
        timezone: orgData.timezone || "Asia/Kolkata",
        status: "ACTIVE",
      },
      create: {
        id: orgData.id,
        name: orgData.name,
        currency: orgData.currency || "INR",
        timezone: orgData.timezone || "Asia/Kolkata",
        status: "ACTIVE",
        settingsJson: orgData.settingsJson || null,
      },
    });

    // 2. Core Users
    const fallbackHash = "$2a$10$wT0/NspT5aLzC8q43j.aZOCnC2R471P6oM9wT8oM.Qx5Cg9nO8g9e"; // Password123!
    for (const u of dataset.users || []) {
      const email = u.email.toLowerCase().trim();
      const existing = await client.user.findFirst({
        where: { email },
        select: { id: true },
      });

      if (!existing) {
        await client.user.create({
          data: {
            id: u.id,
            organizationId: orgData.id,
            name: u.name,
            email,
            passwordHash: u.passwordHash || fallbackHash,
            role: u.role,
            jobTitle: u.jobTitle || null,
            phone: u.phone || null,
            status: "ACTIVE",
          },
        });
      }
    }

    // 3. Sites
    for (const s of dataset.sites || []) {
      await client.site.upsert({
        where: {
          organizationId_code: {
            organizationId: orgData.id,
            code: s.code,
          },
        },
        update: {
          name: s.name,
          address: s.address,
        },
        create: {
          id: s.id,
          organizationId: orgData.id,
          code: s.code,
          name: s.name,
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          geofenceM: s.geofenceM || 300,
          status: "ACTIVE",
        },
      });
    }

    // 4. Projects
    for (const p of dataset.projects || []) {
      await client.project.upsert({
        where: {
          organizationId_code: {
            organizationId: orgData.id,
            code: p.code,
          },
        },
        update: {
          name: p.name,
        },
        create: {
          id: p.id,
          organizationId: orgData.id,
          siteId: p.siteId,
          code: p.code,
          name: p.name,
          managerUserId: p.managerUserId || null,
          status: p.status || "IN_PROGRESS",
          budgetAmount: p.budgetAmount || 0,
          notes: p.notes || null,
        },
      });
    }

    // 5. Material Categories
    for (const cat of dataset.materialCategories || []) {
      await client.materialCategory.upsert({
        where: {
          organizationId_name: {
            organizationId: orgData.id,
            name: cat.name,
          },
        },
        update: {},
        create: {
          id: cat.id,
          organizationId: orgData.id,
          name: cat.name,
        },
      });
    }

    // 6. Materials
    for (const m of dataset.materials || []) {
      await client.material.upsert({
        where: {
          organizationId_sku: {
            organizationId: orgData.id,
            sku: m.sku,
          },
        },
        update: {
          name: m.name,
          unitCode: m.unitCode,
          minStockQty: m.minStockQty || 0,
          unitPrice: m.unitPrice || 0,
        },
        create: {
          id: m.id,
          organizationId: orgData.id,
          categoryId: m.categoryId || null,
          sku: m.sku,
          name: m.name,
          unitCode: m.unitCode,
          minStockQty: m.minStockQty || 0,
          reorderQty: m.reorderQty || 0,
          unitPrice: m.unitPrice || 0,
          active: true,
        },
      });
    }

    // 7. Parties
    for (const party of dataset.parties || []) {
      await client.party.upsert({
        where: { id: party.id },
        update: {
          name: party.name,
          partyType: party.partyType,
          category: party.category || null,
          phone: party.phone || null,
        },
        create: {
          id: party.id,
          organizationId: orgData.id,
          name: party.name,
          partyType: party.partyType,
          category: party.category || null,
          contactPerson: party.contactPerson || null,
          phone: party.phone || null,
          email: party.email || null,
          address: party.address || null,
          taxIdentifier: party.taxIdentifier || null,
          panNumber: party.panNumber || null,
          tdsSection: party.tdsSection || null,
          dailyWageRate: party.dailyWageRate || null,
          maleHelperWageRate: party.maleHelperWageRate || null,
          femaleHelperWageRate: party.femaleHelperWageRate || null,
          active: true,
        },
      });
    }

    console.log("✅ [RUNTIME_SEEDER] Runtime website data self-healing completed successfully.");
    return true;
  } catch (err) {
    console.warn("⚠️ [RUNTIME_SEEDER] Runtime bootstrap warning:", err);
    return false;
  } finally {
    isSeeding = false;
  }
}
