import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Finance Page - Record Bill Modal Integrity", () => {
  it("should have cn correctly imported in src/app/finance/page.tsx", () => {
    const filePath = path.resolve(process.cwd(), "src/app/finance/page.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Must import cn from @/lib/cn
    expect(content).toMatch(/import\s*\{\s*[^}]*\bcn\b[^}]*\}\s*from\s*["']@\/lib\/cn["']/);

    // Verify cn is used for billPaymentStatus buttons
    expect(content).toContain('billPaymentStatus === "UNPAID"');
    expect(content).toContain('billPaymentStatus === "PAID"');
  });

  it("should verify Record Bill button properly triggers showBillModal", () => {
    const filePath = path.resolve(process.cwd(), "src/app/finance/page.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("setShowBillModal(true)");
    expect(content).toContain("showBillModal && canWriteFinance");
  });
});
