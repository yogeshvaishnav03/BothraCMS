import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Table Text Wrapping and Ellipsis Prevention Specification", () => {
  it("enforces table cell wrapping and truncate overrides in globals.css", () => {
    const cssPath = path.join(__dirname, "../app/globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    // Must define wrapping on table td / th
    expect(cssContent).toMatch(/table\s+th,\s*table\s+td\s*\{[^}]*white-space:\s*normal;/);
    expect(cssContent).toMatch(/table\s+th,\s*table\s+td\s*\{[^}]*word-break:\s*break-word;/);

    // Must override truncate inside tables so '...' is not shown and text wraps
    expect(cssContent).toMatch(/table\s+\[class\*="truncate"\]\s*\{[^}]*text-overflow:\s*clip\s*!important;/);
    expect(cssContent).toMatch(/table\s+\[class\*="truncate"\]\s*\{[^}]*white-space:\s*normal\s*!important;/);
  });

  it("enforces break-words and whitespace-normal in shared ExcelTable component cells", () => {
    const excelTablePath = path.join(__dirname, "../components/ui/ExcelTable.tsx");
    const excelTableContent = fs.readFileSync(excelTablePath, "utf8");

    expect(excelTableContent).toContain("break-words whitespace-normal");
  });

  it("ensures Day Book notes wrap instead of truncating with max-w-xs truncate", () => {
    const dayBookPath = path.join(__dirname, "../app/day-book/page.tsx");
    const dayBookContent = fs.readFileSync(dayBookPath, "utf8");

    expect(dayBookContent).not.toMatch(/p\.notes\s*&&[^>]*truncate\s*max-w-xs/);
    expect(dayBookContent).toContain("p.notes && <div className=\"text-[11px] text-slate-400 italic break-words whitespace-normal\">{p.notes}</div>");
  });

  it("ensures Finance payments notes wrap instead of truncating with truncate", () => {
    const financePath = path.join(__dirname, "../app/finance/page.tsx");
    const financeContent = fs.readFileSync(financePath, "utf8");

    expect(financeContent).not.toContain('text-slate-700 truncate" title={p.approvalQuery');
    expect(financeContent).toContain('text-slate-700 break-words whitespace-normal" title={p.approvalQuery');
  });
});
