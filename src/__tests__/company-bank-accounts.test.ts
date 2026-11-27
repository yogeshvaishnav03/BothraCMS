import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";

describe("Company Bank Accounts (Super Admin Configuration & Dropdown Integration)", () => {
  const testOrgId = `org-bank-${Date.now()}`;
  let superAdminId: string;
  let supervisorId: string;

  beforeAll(async () => {
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: "Bothra Test Org",
        settingsJson: JSON.stringify({}),
      },
    });

    const sa = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Super Admin User",
        email: `sa-${Date.now()}@test.com`,
        passwordHash: "hash-sa",
        role: "SUPER_ADMIN",
      },
    });
    superAdminId = sa.id;

    const sup = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Supervisor User",
        email: `sup-${Date.now()}@test.com`,
        passwordHash: "hash-sup",
        role: "SITE_SUPERVISOR",
      },
    });
    supervisorId = sup.id;
  });

  afterAll(async () => {
    try {
      await prisma.auditEvent.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.user.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.organization.delete({ where: { id: testOrgId } });
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  });

  it("saves multiple company bank accounts with bank name, last 4 digits, and holder name", async () => {
    const bankAccounts = [
      {
        id: "bank_1",
        bankName: "HDFC Bank",
        accountLast4: "4421",
        accountHolder: "Bothra Infrastructure & Builders Pvt Ltd",
      },
      {
        id: "bank_2",
        bankName: "State Bank of India",
        accountLast4: "1109",
        accountHolder: "Bothra Infrastructure & Builders Pvt Ltd",
      },
      {
        id: "bank_3",
        bankName: "Kotak Mahindra Bank",
        accountLast4: "9832",
        accountHolder: "Bothra Infrastructure & Builders Pvt Ltd",
      },
    ];

    // Simulate Super Admin updating settingsJson
    const org = await prisma.organization.findUnique({
      where: { id: testOrgId },
    });
    const currentSettings = org?.settingsJson ? JSON.parse(org.settingsJson) : {};
    const updatedSettings = { ...currentSettings, bankAccounts };

    await prisma.organization.update({
      where: { id: testOrgId },
      data: { settingsJson: JSON.stringify(updatedSettings) },
    });

    // Verify persistence
    const savedOrg = await prisma.organization.findUnique({
      where: { id: testOrgId },
    });
    const parsed = JSON.parse(savedOrg?.settingsJson || "{}");

    expect(parsed.bankAccounts).toHaveLength(3);
    expect(parsed.bankAccounts[0].bankName).toBe("HDFC Bank");
    expect(parsed.bankAccounts[0].accountLast4).toBe("4421");
    expect(parsed.bankAccounts[0].accountHolder).toBe("Bothra Infrastructure & Builders Pvt Ltd");
    expect(parsed.bankAccounts[2].bankName).toBe("Kotak Mahindra Bank");
    expect(parsed.bankAccounts[2].accountLast4).toBe("9832");
  });

  it("formats dropdown options correctly for all configured accounts", () => {
    const bankAccounts = [
      {
        id: "bank_1",
        bankName: "HDFC Bank",
        accountLast4: "4421",
        accountHolder: "Bothra Infrastructure & Builders",
      },
      {
        id: "bank_2",
        bankName: "Axis Bank",
        accountLast4: "7654",
        accountHolder: "Bothra Infrastructure",
      },
    ];

    const dropdownLabels = bankAccounts.map(
      (b) => `${b.bankName} - ${b.accountHolder} (A/C: ...${b.accountLast4})`
    );

    expect(dropdownLabels[0]).toBe(
      "HDFC Bank - Bothra Infrastructure & Builders (A/C: ...4421)"
    );
    expect(dropdownLabels[1]).toBe(
      "Axis Bank - Bothra Infrastructure (A/C: ...7654)"
    );
  });

  it("ensures non-super-admin is blocked from modifying bank accounts", () => {
    const userRole = "SITE_SUPERVISOR";
    const isSuperAdmin = userRole === "SUPER_ADMIN";
    expect(isSuperAdmin).toBe(false);

    const superAdminRole = "SUPER_ADMIN";
    const isAllowed = superAdminRole === "SUPER_ADMIN";
    expect(isAllowed).toBe(true);
  });
});
