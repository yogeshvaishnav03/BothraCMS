import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Table View & Row Top-Alignment Specification", () => {
  it("enforces 400px container min-height for filter dropdowns while ensuring tables align rows at the top", () => {
    const cssPath = path.join(__dirname, "../app/globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    // Container must have min-height: 400px so filter popovers are fully visible
    expect(cssContent).toMatch(/@media\s*\(min-width:\s*768px\)\s*\{\s*\.overflow-x-auto:not\(\.compact-table\):has\(table\)\s*\{[^}]*min-height:\s*400px/);

    // Table must have min-height: auto / height: auto to prevent stretching single rows into center
    expect(cssContent).toMatch(/table\s*\{[^}]*min-height:\s*auto/);
    expect(cssContent).toMatch(/table tbody\s*\{[^}]*vertical-align:\s*top/);
    expect(cssContent).toMatch(/table td\s*\{[^}]*vertical-align:\s*top/);
  });

  it("ensures shared ExcelTable container maintains min-h-[400px] while table element does not force row stretching", () => {
    const excelTablePath = path.join(__dirname, "../components/ui/ExcelTable.tsx");
    const excelTableContent = fs.readFileSync(excelTablePath, "utf8");

    // Container wrapper must maintain min-h-[400px] for filter popover room
    expect(excelTableContent).toContain("md:min-h-[400px]");
    expect(excelTableContent).toContain("createPortal");

    // The <table> tag inside ExcelTable should not force min-h-[400px] on the table element
    expect(excelTableContent).not.toMatch(/<table[^>]*min-h-\[400px\]/);
  });

  it("does not render default ArrowUpDown icon on table headers", () => {
    const excelTablePath = path.join(__dirname, "../components/ui/ExcelTable.tsx");
    const excelTableContent = fs.readFileSync(excelTablePath, "utf8");

    // ArrowUpDown icon should be completely removed from ExcelTable headers
    expect(excelTableContent).not.toContain("ArrowUpDown");
  });
});
