import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Table Minimum Height Specification", () => {
  it("enforces minimum height 400px for tables and containers in globals.css", () => {
    const cssPath = path.join(__dirname, "../app/globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    // Must define min-height: 400px for table
    expect(cssContent).toMatch(/table\s*\{[^}]*min-height:\s*400px/);

    // Must define min-height: 400px for .overflow-x-auto:has(table)
    expect(cssContent).toMatch(/\.overflow-x-auto:has\(table\)\s*\{[^}]*min-height:\s*400px/);
  });

  it("enforces min-h-[400px] in shared ExcelTable component", () => {
    const excelTablePath = path.join(__dirname, "../components/ui/ExcelTable.tsx");
    const excelTableContent = fs.readFileSync(excelTablePath, "utf8");

    // ExcelTable wrapper or table container must have min-h-[400px]
    expect(excelTableContent).toContain("min-h-[400px]");
  });
});
