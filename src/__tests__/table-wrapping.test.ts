import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Table Text Wrapping, Ellipsis Prevention, and Mobile Responsiveness Specification", () => {
  it("enforces table cell wrapping, truncate overrides, and mobile table safety in globals.css", () => {
    const cssPath = path.join(__dirname, "../app/globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    // Table th must remain nowrap and never break into vertical letters on mobile
    expect(cssContent).toMatch(/table\s+th\s*\{[^}]*white-space:\s*nowrap\s*!important;/);
    expect(cssContent).toMatch(/table\s+th\s*\{[^}]*word-break:\s*normal\s*!important;/);

    // Table td must wrap text naturally at word boundaries
    expect(cssContent).toMatch(/table\s+td\s*\{[^}]*white-space:\s*normal;/);
    expect(cssContent).toMatch(/table\s+td\s*\{[^}]*overflow-wrap:\s*break-word;/);

    // Must override truncate inside table cells so '...' is not shown and text wraps
    expect(cssContent).toMatch(/table\s+td\s+\[class\*="truncate"\]\s*\{[^}]*text-overflow:\s*clip\s*!important;/);
    expect(cssContent).toMatch(/table\s+td\s+\[class\*="truncate"\]\s*\{[^}]*white-space:\s*normal\s*!important;/);

    // Scrollable tables must maintain readable minimum width on mobile
    expect(cssContent).toMatch(/\.overflow-x-auto\s+table\s*\{[^}]*min-width:\s*max-content;/);
  });

  it("enforces whitespace-nowrap in ExcelColumnHeader and min-w-[640px] in ExcelTable", () => {
    const excelTablePath = path.join(__dirname, "../components/ui/ExcelTable.tsx");
    const excelTableContent = fs.readFileSync(excelTablePath, "utf8");

    expect(excelTableContent).toContain("break-words whitespace-normal");
    expect(excelTableContent).toContain('<span className="whitespace-nowrap">{column.label}</span>');
    expect(excelTableContent).toContain("min-w-[640px]");
  });

  it("ensures Day Book notes wrap instead of truncating with max-w-xs truncate", () => {
    const dayBookPath = path.join(__dirname, "../app/day-book/page.tsx");
    const dayBookContent = fs.readFileSync(dayBookPath, "utf8");

    expect(dayBookContent).not.toMatch(/p\.notes\s*&&[^>]*truncate\s*max-w-xs/);
    expect(dayBookContent).toContain("p.notes && <div className=\"text-[11px] text-slate-400 italic break-words whitespace-normal\">{p.notes}</div>");
  });

  it("ensures Finance payments notes wrap instead of truncating with truncate, and has mobile min-w", () => {
    const financePath = path.join(__dirname, "../app/finance/page.tsx");
    const financeContent = fs.readFileSync(financePath, "utf8");

    expect(financeContent).not.toContain('text-slate-700 truncate" title={p.approvalQuery');
    expect(financeContent).toContain('text-slate-700 break-words whitespace-normal" title={p.approvalQuery');
    expect(financeContent).toContain("min-w-[760px]");
  });
});
