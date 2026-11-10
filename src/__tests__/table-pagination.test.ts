import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  getPaginationRange,
  ShowEntriesControl,
  TablePagination,
  useExcelTable,
  useTablePagination,
  type ExcelColumn,
} from "../components/ui/ExcelTable";

const ROOT = path.resolve(__dirname, "../..");

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("Table Pagination & New-Entries-First Specification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("Constants & Page Range Calculation", () => {
    it("defaults to 10 entries per page and exposes standard DataTables page size options including All (0)", () => {
      expect(DEFAULT_PAGE_SIZE).toBe(10);
      expect(Array.from(PAGE_SIZE_OPTIONS)).toEqual([10, 25, 50, 100, 0]);
    });

    it("computes compact page ranges for small page counts without ellipses", () => {
      expect(getPaginationRange(1, 0)).toEqual([1]);
      expect(getPaginationRange(1, 1)).toEqual([1]);
      expect(getPaginationRange(1, 2)).toEqual([1, 2]);
      expect(getPaginationRange(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("computes ellipses cleanly for larger page counts and never skips a single page with ellipsis", () => {
      expect(getPaginationRange(1, 12)).toEqual([1, 2, 3, 4, 5, "...", 12]);
      expect(getPaginationRange(3, 12)).toEqual([1, 2, 3, 4, 5, "...", 12]);
      expect(getPaginationRange(4, 12)).toEqual([1, 2, 3, 4, 5, "...", 12]);
      expect(getPaginationRange(6, 12)).toEqual([1, "...", 5, 6, 7, "...", 12]);
      expect(getPaginationRange(9, 12)).toEqual([1, "...", 8, 9, 10, 11, 12]);
      expect(getPaginationRange(12, 12)).toEqual([1, "...", 8, 9, 10, 11, 12]);

      // Out-of-bounds clamping
      expect(getPaginationRange(0, 12)).toEqual([1, 2, 3, 4, 5, "...", 12]);
      expect(getPaginationRange(99, 12)).toEqual([1, "...", 8, 9, 10, 11, 12]);

      // Structural invariant across any range
      for (const total of [8, 9, 10, 15, 30]) {
        for (let curr = 1; curr <= total; curr++) {
          const range = getPaginationRange(curr, total);
          expect(range[0]).toBe(1);
          expect(range[range.length - 1]).toBe(total);
          expect(range).toContain(curr);
          const nums = range.filter((x): x is number => typeof x === "number");
          for (let i = 1; i < nums.length; i++) {
            expect(nums[i]).toBeGreaterThan(nums[i - 1]);
            // Never allow an ellipsis to replace only 1 skipped number
            if (range[range.indexOf(nums[i]) - 1] === "...") {
              expect(nums[i] - nums[i - 1]).toBeGreaterThan(2);
            }
          }
        }
      }
    });
  });

  describe("ShowEntriesControl & TablePagination Rendering", () => {
    it("renders DataTables-style Show [ 10 ] entries select with All option and print:hidden", () => {
      const html = renderToStaticMarkup(
        React.createElement(ShowEntriesControl, {
          pageSize: 10,
          onPageSizeChange: () => {},
          id: "entries-select",
        })
      );
      expect(html).toContain("Show");
      expect(html).toContain("entries");
      expect(html).toContain("print:hidden");
      expect(html).toContain('aria-label="Show entries"');
      expect(html).toContain('<option value="10" selected="">10</option>');
      expect(html).toContain('<option value="25">25</option>');
      expect(html).toContain('<option value="50">50</option>');
      expect(html).toContain('<option value="100">100</option>');
      expect(html).toContain('<option value="0">All</option>');
    });

    it("returns empty markup when there are zero items and no unfiltered items", () => {
      const html = renderToStaticMarkup(
        React.createElement(TablePagination, {
          currentPage: 1,
          totalPages: 1,
          totalItems: 0,
          startItem: 0,
          endItem: 0,
          onPageChange: () => {},
        })
      );
      expect(html).toBe("");
    });

    it("renders Showing X to Y of Z entries and segmented navigation controls with proper disabled states", () => {
      const page1Html = renderToStaticMarkup(
        React.createElement(TablePagination, {
          currentPage: 1,
          totalPages: 3,
          totalItems: 25,
          pageSize: 10,
          startItem: 1,
          endItem: 10,
          onPageChange: () => {},
          itemLabel: "records",
        })
      );
      expect(page1Html).toContain("Showing");
      expect(page1Html).toContain("1");
      expect(page1Html).toContain("10");
      expect(page1Html).toContain("25");
      expect(page1Html).toContain("records");
      expect(page1Html).toContain('aria-label="First page"');
      expect(page1Html).toContain('aria-label="Previous page"');
      expect(page1Html).toContain('aria-label="Page 1"');
      expect(page1Html).toContain('aria-current="page"');
      expect(page1Html).toContain('aria-label="Next page"');
      expect(page1Html).toContain('aria-label="Last page"');
      expect(page1Html).toContain("«");
      expect(page1Html).toContain("‹");
      expect(page1Html).toContain("›");
      expect(page1Html).toContain("»");
      expect(page1Html).toMatch(/disabled=""[^>]*aria-label="First page"|aria-label="First page"[^>]*disabled=""/);
      expect(page1Html).not.toMatch(/disabled=""[^>]*aria-label="Next page"|aria-label="Next page"[^>]*disabled=""/);

      const page3Html = renderToStaticMarkup(
        React.createElement(TablePagination, {
          currentPage: 3,
          totalPages: 3,
          totalItems: 25,
          pageSize: 10,
          startItem: 21,
          endItem: 25,
          onPageChange: () => {},
        })
      );
      expect(page3Html).toMatch(/disabled=""[^>]*aria-label="Next page"|aria-label="Next page"[^>]*disabled=""/);
      expect(page3Html).toMatch(/disabled=""[^>]*aria-label="Last page"|aria-label="Last page"[^>]*disabled=""/);
      expect(page3Html).not.toMatch(/disabled=""[^>]*aria-label="First page"|aria-label="First page"[^>]*disabled=""/);
    });

    it("formats filtered empty state and All-mode counter cleanly", () => {
      const filteredZeroHtml = renderToStaticMarkup(
        React.createElement(TablePagination, {
          currentPage: 1,
          totalPages: 1,
          totalItems: 0,
          totalUnfiltered: 42,
          startItem: 0,
          endItem: 0,
          onPageChange: () => {},
          itemLabel: "bills",
        })
      );
      expect(filteredZeroHtml).toContain("filtered from 42 total");
      expect(filteredZeroHtml).toContain("bills");

      const allHtml = renderToStaticMarkup(
        React.createElement(TablePagination, {
          currentPage: 1,
          totalPages: 1,
          totalItems: 25,
          pageSize: 0,
          startItem: 1,
          endItem: 25,
          onPageChange: () => {},
        })
      );
      expect(allHtml).toContain(">1<");
      expect(allHtml).toContain(">25<");
    });
  });

  describe("Hook Behavior: useTablePagination & useExcelTable", () => {
    it("useTablePagination defaults to 10 items, preserves input order (newest first), and exposes filteredCount/totalRecords aliases", () => {
      const rows = Array.from({ length: 24 }, (_, idx) => ({ id: `newest-${24 - idx}` }));
      let captured: ReturnType<typeof useTablePagination<{ id: string }>> | null = null;

      function Harness() {
        captured = useTablePagination(rows);
        return React.createElement("div");
      }

      renderToStaticMarkup(React.createElement(Harness));
      expect(captured).not.toBeNull();
      expect(captured!.pageSize).toBe(10);
      expect(captured!.currentPage).toBe(1);
      expect(captured!.totalPages).toBe(3);
      expect(captured!.totalItems).toBe(24);
      expect(captured!.filteredCount).toBe(24);
      expect(captured!.totalRecords).toBe(24);
      expect(captured!.startItem).toBe(1);
      expect(captured!.endItem).toBe(10);
      expect(captured!.paginatedData).toHaveLength(10);
      expect(captured!.paginatedData[0].id).toBe("newest-24");
    });

    it("useTablePagination returns all items when initialPageSize is 0 (All)", () => {
      const rows = Array.from({ length: 18 }, (_, idx) => ({ id: idx + 1 }));
      let captured: ReturnType<typeof useTablePagination<{ id: number }>> | null = null;

      function Harness() {
        captured = useTablePagination(rows, 0);
        return React.createElement("div");
      }

      renderToStaticMarkup(React.createElement(Harness));
      expect(captured!.totalPages).toBe(1);
      expect(captured!.startItem).toBe(1);
      expect(captured!.endItem).toBe(18);
      expect(captured!.paginatedData).toHaveLength(18);
    });

    it("useExcelTable paginates display rows to 10 by default while exportCSV exports all filteredData across all pages", async () => {
      const rows = Array.from({ length: 25 }, (_, idx) => ({
        id: idx + 1,
        name: `Row-${String(idx + 1).padStart(2, "0")}`,
      }));
      const columns: ExcelColumn<{ id: number; name: string }>[] = [
        { key: "id", label: "ID", accessor: (r) => r.id, type: "number" },
        { key: "name", label: "Name", accessor: (r) => r.name, type: "text" },
      ];

      let captured: ReturnType<typeof useExcelTable<{ id: number; name: string }>> | null = null;
      function Harness() {
        captured = useExcelTable({ data: rows, columns });
        return React.createElement("div");
      }

      renderToStaticMarkup(React.createElement(Harness));
      expect(captured!.pageSize).toBe(10);
      expect(captured!.paginatedData).toHaveLength(10);
      expect(captured!.filteredData).toHaveLength(25);
      expect(captured!.totalPages).toBe(3);

      let capturedBlob: Blob | null = null;
      const linkEl: any = { click: vi.fn(), style: {} };
      vi.stubGlobal("document", {
        createElement: vi.fn(() => linkEl),
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
      });
      vi.stubGlobal("window", {
        setTimeout: vi.fn(() => 1),
      });
      vi.spyOn(URL, "createObjectURL").mockImplementation((b: any) => {
        capturedBlob = b;
        return "blob:test-export";
      });
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

      captured!.exportCSV("all-rows.csv");
      expect(capturedBlob).not.toBeNull();
      const csvText = await capturedBlob!.text();
      expect(csvText).toContain("Row-01");
      expect(csvText).toContain("Row-15");
      expect(csvText).toContain("Row-25");
    });
  });

  describe("Repository-Wide UI Pagination & Print Exclusion Audit", () => {
    const paginatedPages = [
      "src/app/attendance/page.tsx",
      "src/app/expenses/page.tsx",
      "src/app/finance/page.tsx",
      "src/app/materials/page.tsx",
      "src/app/materials/[id]/page.tsx",
      "src/app/parties/page.tsx",
      "src/app/parties/[id]/page.tsx",
      "src/app/projects/page.tsx",
      "src/app/projects/[id]/page.tsx",
      "src/app/audit/page.tsx",
      "src/app/settings/page.tsx",
      "src/app/reports/page.tsx",
      "src/app/workforce/page.tsx",
      "src/app/admin/page.tsx",
      "src/app/day-book/page.tsx",
      "src/app/settings/payments/page.tsx",
      "src/app/material-requests/page.tsx",
      "src/app/team/page.tsx",
      "src/app/drawings/page.tsx",
      "src/app/tasks/page.tsx",
      "src/app/attendance/muster/page.tsx",
      "src/app/work-reports/page.tsx",
      "src/app/measurement-book/page.tsx",
      "src/app/payroll/page.tsx",
    ];

    it("enforces pagination controls and paginatedData rendering on all 24 operational pages", () => {
      for (const relPath of paginatedPages) {
        const content = readRepoFile(relPath);
        const usesPaginationHook =
          content.includes("paginatedData") || content.includes("<ExcelTable");
        const rendersPaginationBar =
          content.includes("<TablePagination") || content.includes("<ExcelTable");
        const rendersEntriesControl =
          content.includes("<ShowEntriesControl") ||
          content.includes("<ExcelTableToolbar") ||
          content.includes("<ExcelTable");

        expect(usesPaginationHook, `${relPath} must use paginatedData or <ExcelTable>`).toBe(true);
        expect(rendersPaginationBar, `${relPath} must render <TablePagination> or <ExcelTable>`).toBe(true);
        expect(rendersEntriesControl, `${relPath} must render <ShowEntriesControl> or <ExcelTableToolbar>`).toBe(true);
        expect(content, `${relPath} should not sum totals over paginatedData`).not.toContain("paginatedData.reduce");
      }
    });

    it("keeps CSV exports iterating filteredData rather than paginatedData", () => {
      const excelContent = readRepoFile("src/components/ui/ExcelTable.tsx");
      expect(excelContent).toMatch(/exportCSV[\s\S]*?filteredData\.map/);

      const reportsContent = readRepoFile("src/app/reports/page.tsx");
      expect(reportsContent).toContain("excelStock.filteredData.map");
      expect(reportsContent).toContain("excelPayables.filteredData.map");
      expect(reportsContent).toContain("excelAttendanceReport.filteredData.map");
    });

    it("keeps statutory, print, and Form 16/26Q tables unpaginated", () => {
      const excludedPrintFiles = [
        "src/app/payroll/tds-return/page.tsx",
        "src/components/sales/SalesDocuments.tsx",
      ];
      for (const relPath of excludedPrintFiles) {
        const content = readRepoFile(relPath);
        expect(content).not.toContain("useTablePagination");
        expect(content).not.toContain("<TablePagination");
      }
      const dayBookContent = readRepoFile("src/app/day-book/page.tsx");
      expect(dayBookContent).toContain("printDisbursedPayments.map");
      expect(dayBookContent).toContain("printBills.map");
    });
  });

  describe("New Entries First Ordering Audit (UI + API + Services)", () => {
    it("defaults Vendors & Contractors UI sorting to most recently added first", () => {
      const partiesPage = readRepoFile("src/app/parties/page.tsx");
      expect(partiesPage).toContain('useState<"recent" | "name" | "outstanding" | "rating">("recent")');
    });

    it("orders transactional APIs and services newest-first (desc)", () => {
      const expectedDescRoutes: [string, RegExp][] = [
        ["src/app/api/finance/payments/route.ts", /orderBy:\s*\[\s*\{\s*paymentDate:\s*"desc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/],
        ["src/app/api/finance/bills/route.ts", /orderBy:\s*\[\s*\{\s*billDate:\s*"desc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/],
        ["src/app/api/expenses/route.ts", /orderBy:\s*\[\s*\{\s*paymentDate:\s*"desc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/],
        ["src/app/api/parties/route.ts", /orderBy:\s*\{\s*createdAt:\s*"desc"\s*\}/],
        ["src/app/api/parties/[id]/route.ts", /orderBy:\s*\[\s*\{\s*billDate:\s*"desc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/],
        ["src/app/api/parties/[id]/route.ts", /orderBy:\s*\[\s*\{\s*paymentDate:\s*"desc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/],
        ["src/app/api/workforce/route.ts", /orderBy:\s*\{\s*createdAt:\s*"desc"\s*\}/],
        ["src/app/api/organization/route.ts", /orderBy:\s*\{\s*createdAt:\s*"desc"\s*\}/],
        ["src/services/day-book-service.ts", /orderBy:\s*\[\s*\{\s*paymentDate:\s*"desc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/],
        ["src/services/day-book-service.ts", /orderBy:\s*\[\s*\{\s*billDate:\s*"desc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/],
        ["src/services/user-admin-service.ts", /orderBy:\s*\[\s*\{\s*status:\s*"asc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/],
        ["src/services/measurement-book-service.ts", /entries:\s*\{[\s\S]*?orderBy:\s*\{\s*createdAt:\s*"desc"\s*\}/],
        ["src/services/drawing-service.ts", /orderBy:\s*\[\s*\{\s*updatedAt:\s*"desc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/],
        ["src/services/payroll-service.ts", /payrollAdvance\.findMany\([\s\S]*?orderBy:\s*\[\s*\{\s*givenOn:\s*"desc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/],
        ["src/services/work-report-service.ts", /orderBy:\s*\[\s*\{\s*reportDate:\s*"desc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/],
      ];

      for (const [relPath, pattern] of expectedDescRoutes) {
        const content = readRepoFile(relPath);
        expect(content, `${relPath} missing newest-first orderBy ${pattern}`).toMatch(pattern);
      }
    });

    it("preserves chronological running-balance math in inventory ledger before returning newest-first entries", () => {
      const invService = readRepoFile("src/services/inventory-service.ts");
      expect(invService).toMatch(/orderBy:\s*\[\s*\{\s*movementAt:\s*"asc"\s*\},\s*\{\s*createdAt:\s*"asc"\s*\}\s*\]/);
      expect(invService).toContain("entries: ledgerEntries.reverse()");
      expect(invService).toMatch(/material\.findMany\([\s\S]*?orderBy:\s*\{\s*createdAt:\s*"desc"\s*\}/);
    });

    it("orders party statement newest-first while preserving chronological Form 26Q TDS ordering", () => {
      const finService = readRepoFile("src/services/finance-service.ts");
      expect(finService).toMatch(/getPartyStatement[\s\S]*?orderBy:\s*\[\s*\{\s*billDate:\s*"desc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/);
      expect(finService).toMatch(/getPartyStatement[\s\S]*?orderBy:\s*\[\s*\{\s*paymentDate:\s*"desc"\s*\},\s*\{\s*createdAt:\s*"desc"\s*\}\s*\]/);
      expect(finService).toMatch(/contractorTdsReturn[\s\S]*?orderBy:\s*\{\s*paymentDate:\s*"asc"\s*\}/);
    });
  });
});
