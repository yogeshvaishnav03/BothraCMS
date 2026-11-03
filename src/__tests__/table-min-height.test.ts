import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Table View & Row Top-Alignment Specification", () => {
  it("enforces natural height and top alignment for tables in globals.css so single records appear on top", () => {
    const cssPath = path.join(__dirname, "../app/globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    // Table must have min-height: auto / height: auto to prevent stretching single rows into center
    expect(cssContent).toMatch(/table\s*\{[^}]*min-height:\s*auto/);
    expect(cssContent).toMatch(/table tbody\s*\{[^}]*vertical-align:\s*top/);
    expect(cssContent).toMatch(/table td\s*\{[^}]*vertical-align:\s*top/);
  });

  it("ensures shared ExcelTable table element does not force min-h-[400px] on the table itself", () => {
    const excelTablePath = path.join(__dirname, "../components/ui/ExcelTable.tsx");
    const excelTableContent = fs.readFileSync(excelTablePath, "utf8");

    // The <table> tag inside ExcelTable should not force min-h-[400px]
    expect(excelTableContent).not.toMatch(/<table[^>]*min-h-\[400px\]/);
  });

  it("does not render default ArrowUpDown icon on table headers", () => {
    const excelTablePath = path.join(__dirname, "../components/ui/ExcelTable.tsx");
    const excelTableContent = fs.readFileSync(excelTablePath, "utf8");

    // ArrowUpDown icon should be completely removed from ExcelTable headers
    expect(excelTableContent).not.toContain("ArrowUpDown");
  });
});
