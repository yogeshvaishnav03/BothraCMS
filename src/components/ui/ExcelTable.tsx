"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { downloadCsv } from "@/lib/csv-download";
import {
  Filter,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  Check,
  RotateCcw,
  Download,
  SlidersHorizontal,
  Calendar,
  CalendarDays,
  Hash,
  Type,
  CheckCircle2,
  ChevronRight,
  ChevronUp,
  Layers,
  Sparkles,
  CreditCard,
  Landmark,
  Coins,
  Building2,
  Users,
  Tag,
} from "lucide-react";

export type SortDirection = "asc" | "desc" | null;

export interface RangeFilter {
  min?: number;
  max?: number;
  fromDate?: string;
  toDate?: string;
}

const EMPTY_DISTINCT_VALUES: Array<{ value: string; count: number; rawSample: any }> = [];

export interface ExcelColumn<T = any> {
  key: string;
  label: string;
  accessor?: (row: T) => any;
  render?: (row: T, value: any) => React.ReactNode;
  sortable?: boolean; // default true
  filterable?: boolean; // default true
  align?: "left" | "center" | "right";
  className?: string;
  headerClassName?: string;
  width?: string;
  type?: "text" | "number" | "date" | "currency";
}

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 0] as const; // 0 = All

export function getPaginationRange(
  currentPage: number,
  totalPages: number
): Array<number | "..."> {
  if (totalPages <= 1) return [1];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const safeCurrent = Math.min(Math.max(1, currentPage), totalPages);
  const pages: Array<number | "..."> = [1];
  let windowStart = Math.max(2, safeCurrent - 1);
  let windowEnd = Math.min(totalPages - 1, safeCurrent + 1);

  if (safeCurrent <= 3) {
    windowStart = 2;
    windowEnd = Math.min(totalPages - 1, 5);
  } else if (safeCurrent >= totalPages - 2) {
    windowStart = Math.max(2, totalPages - 4);
    windowEnd = totalPages - 1;
  }

  if (windowStart > 2) {
    if (windowStart === 3) pages.push(2);
    else pages.push("...");
  }

  for (let p = windowStart; p <= windowEnd; p++) {
    pages.push(p);
  }

  if (windowEnd < totalPages - 1) {
    if (windowEnd === totalPages - 2) pages.push(totalPages - 1);
    else pages.push("...");
  }

  pages.push(totalPages);
  return pages;
}

/**
 * Standalone pagination hook for tables/lists that do not use useExcelTable.
 */
export function useTablePagination<T = any>(
  data: T[],
  initialPageSize: number = DEFAULT_PAGE_SIZE
) {
  const [pageSize, setPageSizeState] = useState<number>(initialPageSize);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalItems = data.length;
  const totalPages =
    pageSize && pageSize > 0 ? Math.max(1, Math.ceil(totalItems / pageSize)) : 1;
  const safeCurrentPage =
    totalItems === 0 ? 1 : Math.min(Math.max(1, currentPage), totalPages);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const setPageSize = useCallback((nextSize: number) => {
    setPageSizeState(nextSize);
    setCurrentPage(1);
  }, []);

  const paginatedData = useMemo(() => {
    if (!pageSize || pageSize <= 0) return data;
    const start = (safeCurrentPage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, pageSize, safeCurrentPage]);

  const startItem =
    totalItems === 0 ? 0 : !pageSize || pageSize <= 0 ? 1 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem =
    totalItems === 0 ? 0 : !pageSize || pageSize <= 0 ? totalItems : Math.min(safeCurrentPage * pageSize, totalItems);

  return {
    paginatedData,
    pageSize,
    setPageSize,
    currentPage: safeCurrentPage,
    setCurrentPage,
    totalPages,
    totalItems,
    filteredCount: totalItems,
    totalRecords: totalItems,
    startItem,
    endItem,
  };
}

export interface ExcelTableProps<T = any> {
  data: T[];
  columns: ExcelColumn<T>[];
  keyField?: keyof T | ((row: T, index: number) => string | number);
  tableName?: string;
  showGlobalSearch?: boolean;
  showExport?: boolean;
  showToolbar?: boolean;
  showEntries?: boolean;
  emptyMessage?: string;
  pageSize?: number; // 0 for all, defaults to 10
  className?: string;
  tableClassName?: string;
  theme?: "lightHeader" | "darkHeader";
  onRowClick?: (row: T) => void;
  actionsHeader?: React.ReactNode;
  renderRowActions?: (row: T) => React.ReactNode;
}

/**
 * Hook to manage Excel-like sorting and multi-select checklist filtering over any array of data.
 */
export function useExcelTable<T = any>({
  data,
  columns,
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
}: {
  data: T[];
  columns: ExcelColumn<T>[];
  pageSize?: number;
}) {
  const [globalSearch, setGlobalSearch] = useState("");
  const [sortColumnKey, setSortColumnKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Column-specific filter states: map of columnKey -> Set of selected value strings
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [rangeFilters, setRangeFilters] = useState<Record<string, RangeFilter>>({});
  const [textFilters, setTextFilters] = useState<Record<string, string>>({});
  const [isMegaFilterOpen, setIsMegaFilterOpen] = useState(false);
  const [activeMegaColumnKey, setActiveMegaColumnKey] = useState<string>(columns[0]?.key || "");
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [filterSearchQueries, setFilterSearchQueries] = useState<Record<string, string>>({});
  const [pageSize, setPageSizeState] = useState<number>(initialPageSize);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setPageSizeState(initialPageSize);
    setCurrentPage(1);
  }, [initialPageSize]);

  const setPageSize = useCallback((nextSize: number) => {
    setPageSizeState(nextSize);
    setCurrentPage(1);
  }, []);

  // Helper to extract raw value for a row and column
  const getCellValue = useMemo(() => {
    return (row: T, col: ExcelColumn<T>): any => {
      if (col.accessor) return col.accessor(row);
      return (row as any)[col.key];
    };
  }, []);

  // Helper to format value as a distinct checklist string
  const formatValueKey = (val: any): string => {
    if (val === null || val === undefined || val === "") return "(Blanks)";
    if (typeof val === "boolean") return val ? "True" : "False";
    return String(val);
  };

  // Compute distinct values and counts for each column
  const distinctValuesMap = useMemo(() => {
    const map: Record<string, { value: string; count: number; rawSample: any }[]> = {};

    columns.forEach((col) => {
      const counts: Record<string, { count: number; rawSample: any }> = {};
      data.forEach((row) => {
        const raw = getCellValue(row, col);
        const str = formatValueKey(raw);
        if (!counts[str]) {
          counts[str] = { count: 0, rawSample: raw };
        }
        counts[str].count += 1;
      });

      const list = Object.entries(counts).map(([value, info]) => ({
        value,
        count: info.count,
        rawSample: info.rawSample,
      }));

      // Sort values: Blanks at bottom, numbers numerically, dates chronologically, strings alphabetically
      list.sort((a, b) => {
        if (a.value === "(Blanks)") return 1;
        if (b.value === "(Blanks)") return -1;
        if (col.type === "number" || col.type === "currency") {
          const numA = Number(a.rawSample) || 0;
          const numB = Number(b.rawSample) || 0;
          return numA - numB;
        }
        return a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: "base" });
      });

      map[col.key] = list;
    });

    return map;
  }, [data, columns, getCellValue]);

  // Apply Filtering and Sorting
  const filteredData = useMemo(() => {
    let result = [...data];

    // 1. Global search
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase().trim();
      result = result.filter((row) => {
        return columns.some((col) => {
          const val = getCellValue(row, col);
          return formatValueKey(val).toLowerCase().includes(q);
        });
      });
    }

    // 2. Excel Column Filters (Checklist)
    Object.entries(columnFilters).forEach(([colKey, selectedSet]) => {
      const col = columns.find((c) => c.key === colKey);
      if (!col) return;

      result = result.filter((row) => {
        const raw = getCellValue(row, col);
        const str = formatValueKey(raw);
        return selectedSet.has(str);
      });
    });

    // 2b. Range Filters (Numeric min/max & Date from/to)
    Object.entries(rangeFilters).forEach(([colKey, range]) => {
      const col = columns.find((c) => c.key === colKey);
      if (!col) return;

      if (col.type === "number" || col.type === "currency") {
        if (range.min !== undefined && range.min !== null && !isNaN(range.min)) {
          result = result.filter((row) => {
            const raw = getCellValue(row, col);
            if (raw === null || raw === undefined || raw === "") return false;
            const num = Number(raw);
            return !isNaN(num) && num >= range.min!;
          });
        }
        if (range.max !== undefined && range.max !== null && !isNaN(range.max)) {
          result = result.filter((row) => {
            const raw = getCellValue(row, col);
            if (raw === null || raw === undefined || raw === "") return false;
            const num = Number(raw);
            return !isNaN(num) && num <= range.max!;
          });
        }
      } else if (col.type === "date") {
        if (range.fromDate) {
          const fromTime = new Date(`${range.fromDate}T00:00:00`).getTime();
          result = result.filter((row) => {
            const raw = getCellValue(row, col);
            if (!raw) return false;
            const time = new Date(raw).getTime();
            return !isNaN(time) && time >= fromTime;
          });
        }
        if (range.toDate) {
          const toTime = new Date(`${range.toDate}T23:59:59.999`).getTime();
          result = result.filter((row) => {
            const raw = getCellValue(row, col);
            if (!raw) return false;
            const time = new Date(raw).getTime();
            return !isNaN(time) && time <= toTime;
          });
        }
      }
    });

    // 2c. Column-specific Text Search Filters
    Object.entries(textFilters).forEach(([colKey, query]) => {
      if (!query || !query.trim()) return;
      const q = query.toLowerCase().trim();
      const col = columns.find((c) => c.key === colKey);
      if (!col) return;

      result = result.filter((row) => {
        const raw = getCellValue(row, col);
        return formatValueKey(raw).toLowerCase().includes(q);
      });
    });

    // 3. Sorting
    if (sortColumnKey && sortDirection) {
      const col = columns.find((c) => c.key === sortColumnKey);
      if (col) {
        result.sort((a, b) => {
          const valA = getCellValue(a, col);
          const valB = getCellValue(b, col);

          if (valA === valB) return 0;
          if (valA === null || valA === undefined || valA === "") return 1;
          if (valB === null || valB === undefined || valB === "") return -1;

          let cmp = 0;
          if (col.type === "number" || col.type === "currency") {
            cmp = (Number(valA) || 0) - (Number(valB) || 0);
          } else if (col.type === "date") {
            cmp = new Date(valA).getTime() - new Date(valB).getTime();
          } else {
            cmp = String(valA).localeCompare(String(valB), undefined, {
              numeric: true,
              sensitivity: "base",
            });
          }

          return sortDirection === "asc" ? cmp : -cmp;
        });
      }
    }

    return result;
  }, [data, columns, globalSearch, columnFilters, rangeFilters, textFilters, sortColumnKey, sortDirection, getCellValue]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [globalSearch, columnFilters, rangeFilters, textFilters, sortColumnKey, sortDirection]);

  const totalPages =
    pageSize && pageSize > 0 ? Math.max(1, Math.ceil(filteredData.length / pageSize)) : 1;
  const safeCurrentPage =
    filteredData.length === 0 ? 1 : Math.min(Math.max(1, currentPage), totalPages);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  // Pagination slice
  const paginatedData = useMemo(() => {
    if (!pageSize || pageSize <= 0) return filteredData;
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, safeCurrentPage, pageSize]);

  const startItem =
    filteredData.length === 0
      ? 0
      : !pageSize || pageSize <= 0
      ? 1
      : (safeCurrentPage - 1) * pageSize + 1;
  const endItem =
    filteredData.length === 0
      ? 0
      : !pageSize || pageSize <= 0
      ? filteredData.length
      : Math.min(safeCurrentPage * pageSize, filteredData.length);

  // Active filter count (checklist filters + active range filters + text filters + global search)
  const activeFiltersCount =
    Object.keys(columnFilters).length +
    Object.values(rangeFilters).filter(
      (r) =>
        r.min !== undefined ||
        r.max !== undefined ||
        Boolean(r.fromDate) ||
        Boolean(r.toDate)
    ).length +
    Object.keys(textFilters).filter((k) => Boolean(textFilters[k]?.trim())).length +
    (globalSearch ? 1 : 0);

  // Handlers
  const handleSort = (colKey: string, direction?: SortDirection) => {
    if (direction !== undefined) {
      setSortColumnKey(direction ? colKey : null);
      setSortDirection(direction);
      return;
    }
    // Toggle sort: asc -> desc -> null
    if (sortColumnKey !== colKey) {
      setSortColumnKey(colKey);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortColumnKey(null);
      setSortDirection(null);
    }
  };

  const toggleFilterValue = (colKey: string, value: string) => {
    const allValues = distinctValuesMap[colKey]?.map((d) => d.value) || [];
    const currentSet = columnFilters[colKey] ? new Set(columnFilters[colKey]) : new Set(allValues);

    if (currentSet.has(value)) {
      currentSet.delete(value);
    } else {
      currentSet.add(value);
    }

    // If all values are selected, clear filter for this column
    if (currentSet.size === allValues.length) {
      clearColumnFilter(colKey);
    } else {
      setColumnFilters((prev) => ({
        ...prev,
        [colKey]: currentSet,
      }));
    }
  };

  const selectAllColumnValues = (colKey: string, visibleValuesOnly?: string[]) => {
    const allValues = visibleValuesOnly || distinctValuesMap[colKey]?.map((d) => d.value) || [];
    const currentSet = columnFilters[colKey] ? new Set(columnFilters[colKey]) : new Set<string>();

    allValues.forEach((v) => currentSet.add(v));

    const totalValues = distinctValuesMap[colKey]?.map((d) => d.value) || [];
    if (currentSet.size === totalValues.length) {
      clearColumnFilter(colKey);
    } else {
      setColumnFilters((prev) => ({
        ...prev,
        [colKey]: currentSet,
      }));
    }
  };

  const deselectAllColumnValues = (colKey: string, visibleValuesOnly?: string[]) => {
    if (!visibleValuesOnly) {
      setColumnFilters((prev) => ({
        ...prev,
        [colKey]: new Set<string>(),
      }));
    } else {
      const currentSet = columnFilters[colKey]
        ? new Set(columnFilters[colKey])
        : new Set(distinctValuesMap[colKey]?.map((d) => d.value) || []);
      visibleValuesOnly.forEach((v) => currentSet.delete(v));
      setColumnFilters((prev) => ({
        ...prev,
        [colKey]: currentSet,
      }));
    }
  };

  const selectBlanksOnly = (colKey: string) => {
    setColumnFilters((prev) => ({
      ...prev,
      [colKey]: new Set(["(Blanks)"]),
    }));
  };

  const selectNonBlanksOnly = (colKey: string) => {
    const nonBlanks = (distinctValuesMap[colKey] || [])
      .map((d) => d.value)
      .filter((v) => v !== "(Blanks)");
    setColumnFilters((prev) => ({
      ...prev,
      [colKey]: new Set(nonBlanks),
    }));
  };

  const setRangeFilter = (colKey: string, range: RangeFilter) => {
    setRangeFilters((prev) => {
      if (
        range.min === undefined &&
        range.max === undefined &&
        !range.fromDate &&
        !range.toDate
      ) {
        const next = { ...prev };
        delete next[colKey];
        return next;
      }
      return { ...prev, [colKey]: range };
    });
  };

  const clearRangeFilter = (colKey: string) => {
    setRangeFilters((prev) => {
      const next = { ...prev };
      delete next[colKey];
      return next;
    });
  };

  const clearColumnFilter = (colKey: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[colKey];
      return next;
    });
  };

  const setTextFilter = (colKey: string, query: string) => {
    setTextFilters((prev) => {
      if (!query || !query.trim()) {
        const next = { ...prev };
        delete next[colKey];
        return next;
      }
      return { ...prev, [colKey]: query };
    });
  };

  const clearTextFilter = (colKey: string) => {
    setTextFilters((prev) => {
      const next = { ...prev };
      delete next[colKey];
      return next;
    });
  };

  const setSingleColumnValue = (colKey: string, value: string | null) => {
    if (value === null || value === "ALL") {
      clearColumnFilter(colKey);
    } else {
      setColumnFilters((prev) => ({
        ...prev,
        [colKey]: new Set([value]),
      }));
    }
  };

  const clearAllFilters = () => {
    setColumnFilters({});
    setRangeFilters({});
    setTextFilters({});
    setGlobalSearch("");
    setSortColumnKey(null);
    setSortDirection(null);
  };

  const exportCSV = (filename: string = "table-export.csv") => {
    if (filteredData.length === 0) return;

    const headers = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`);
    const rows = filteredData.map((row) =>
      columns
        .map((col) => {
          const val = getCellValue(row, col);
          const str = val === null || val === undefined ? "" : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(",")
    );

    downloadCsv(filename, [headers.join(","), ...rows].join("\n"));
  };

  return {
    filteredData,
    paginatedData,
    currentPage: safeCurrentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    startItem,
    endItem,
    totalRecords: data.length,
    filteredCount: filteredData.length,
    globalSearch,
    setGlobalSearch,
    sortColumnKey,
    sortDirection,
    handleSort,
    columnFilters,
    rangeFilters,
    textFilters,
    setTextFilter,
    clearTextFilter,
    setSingleColumnValue,
    setRangeFilter,
    clearRangeFilter,
    selectBlanksOnly,
    selectNonBlanksOnly,
    isMegaFilterOpen,
    setIsMegaFilterOpen,
    activeMegaColumnKey,
    setActiveMegaColumnKey,
    distinctValuesMap,
    openFilterKey,
    setOpenFilterKey,
    filterSearchQueries,
    setFilterSearchQueries,
    toggleFilterValue,
    selectAllColumnValues,
    deselectAllColumnValues,
    clearColumnFilter,
    clearAllFilters,
    activeFiltersCount,
    exportCSV,
    getCellValue,
  };
}

/**
 * Excel Column Header with dropdown sorting, text filtering, and distinct value checkboxes
 */
export function ExcelColumnHeader<T = any>({
  column,
  table,
  theme = "lightHeader",
}: {
  column: ExcelColumn<T>;
  table: ReturnType<typeof useExcelTable<T>>;
  theme?: "lightHeader" | "darkHeader";
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const isOpen = table.openFilterKey === column.key;
  const isSorted = table.sortColumnKey === column.key && table.sortDirection !== null;
  const isFiltered = Boolean(table.columnFilters[column.key]);

  const distinctValues = table.distinctValuesMap[column.key] || EMPTY_DISTINCT_VALUES;
  const colSearch = table.filterSearchQueries[column.key] || "";

  // Values visible according to the column search query in popover
  const visibleValues = useMemo(() => {
    if (!colSearch.trim()) return distinctValues;
    const q = colSearch.toLowerCase().trim();
    return distinctValues.filter((d) => d.value.toLowerCase().includes(q));
  }, [distinctValues, colSearch]);

  const selectedSet = table.columnFilters[column.key];
  const allSelected = !selectedSet;
  const selectedCount = allSelected
    ? distinctValues.length
    : distinctValues.filter((d) => selectedSet.has(d.value)).length;

  const isIndeterminate = !allSelected && selectedCount > 0 && selectedCount < distinctValues.length;
  const isNoneSelected = !allSelected && selectedCount === 0;

  const isDark = theme === "darkHeader";

  const updatePopoverPos = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 12;
    const width = Math.min(264, vw - pad * 2);
    const left = Math.max(pad, Math.min(rect.right - width, vw - width - pad));
    const maxEstH = Math.min(380, vh - pad * 2);
    let top = rect.bottom + 6;
    if (top + maxEstH > vh - pad && rect.top - maxEstH - 6 > pad) {
      top = rect.top - maxEstH - 6;
    } else if (top + maxEstH > vh - pad) {
      top = Math.max(pad, vh - maxEstH - pad);
    }
    setPopoverPos({ top, left, width });
  }, []);

  // Position cleanly in viewport and close on outside tap/click or Esc
  useEffect(() => {
    if (!isOpen) {
      setPopoverPos(null);
      return;
    }
    updatePopoverPos();
    const handleClickOutside = (e: Event) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        (!triggerRef.current || !triggerRef.current.contains(target))
      ) {
        table.setOpenFilterKey(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") table.setOpenFilterKey(null);
    };

    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePopoverPos);
    window.addEventListener("scroll", updatePopoverPos, true);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePopoverPos);
      window.removeEventListener("scroll", updatePopoverPos, true);
    };
  }, [isOpen, table, updatePopoverPos]);

  return (
    <th
      className={`relative select-none px-3.5 py-3 text-xs font-semibold tracking-wider transition ${
        isDark ? "text-slate-200" : "text-slate-700"
      } ${column.headerClassName || ""} ${
        column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"
      }`}
      style={{ width: column.width }}
    >
      <div
        className={`flex items-center gap-2.5 ${
          column.align === "right"
            ? "justify-end"
            : column.align === "center"
            ? "justify-center"
            : "justify-between"
        }`}
      >
        {/* Column Label with click to sort */}
        <button
          type="button"
          onClick={() => {
            if (column.sortable !== false) {
              table.handleSort(column.key);
            }
          }}
          className={`flex items-center gap-2 font-bold transition text-left pr-1 cursor-pointer group/sort whitespace-nowrap ${
            isDark ? "text-slate-200 hover:text-amber-400" : "text-slate-800 hover:text-amber-600"
          }`}
          title={column.sortable !== false ? `Click to sort by ${column.label}` : column.label}
        >
          <span className="whitespace-nowrap">{column.label}</span>
          {column.sortable !== false && isSorted && (
            <span className="shrink-0 ml-1">
              {table.sortDirection === "asc" ? (
                <ArrowUp className="w-3.5 h-3.5 text-amber-500 stroke-[2.5]" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5 text-amber-500 stroke-[2.5]" />
              )}
            </span>
          )}
        </button>

        {/* Excel Filter Dropdown Trigger Button */}
        {column.filterable !== false && (
          <button
            ref={triggerRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              table.setOpenFilterKey(isOpen ? null : column.key);
            }}
            className={`ml-2 p-1.5 rounded-lg transition relative flex items-center justify-center shrink-0 cursor-pointer ${
              isFiltered
                ? "bg-amber-500 text-slate-950 ring-2 ring-amber-400 shadow-xs"
                : isOpen
                ? isDark ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-900"
                : isDark
                ? "text-slate-400 hover:text-white hover:bg-slate-800"
                : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            }`}
            title={`Filter: ${column.label} ${isFiltered ? "(Active)" : ""}`}
          >
            <Filter className={`w-3.5 h-3.5 ${isFiltered ? "stroke-[2.5]" : ""}`} />
            {isFiltered && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full ring-1 ring-white" />
            )}
          </button>
        )}
      </div>

      {/* Excel Filter Popover Menu rendered in Portal so overflow-x-auto never clips it */}
      {isOpen && typeof document !== "undefined" && popoverPos && createPortal(
        <div
          ref={popoverRef}
          style={{ top: popoverPos.top, left: popoverPos.left, width: popoverPos.width }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-[110] max-h-[80dvh] overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-2xl p-3 text-slate-800 text-xs text-left normal-case tracking-normal animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="font-black text-slate-900 truncate">
              Filter: {column.label}
            </span>
            <button
              type="button"
              onClick={() => table.setOpenFilterKey(null)}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Sort Section (A-Z / Z-A) */}
          {column.sortable !== false && (
            <div className="py-2 border-b border-slate-100 space-y-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Sort Options
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => table.handleSort(column.key, "asc")}
                  className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-semibold border flex items-center justify-center gap-1 transition ${
                    isSorted && table.sortDirection === "asc"
                      ? "bg-amber-500 text-slate-950 border-amber-500 font-bold"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <ArrowUp className="w-3 h-3" />
                  <span>{column.type === "number" || column.type === "currency" ? "Smallest" : "A → Z"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => table.handleSort(column.key, "desc")}
                  className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-semibold border flex items-center justify-center gap-1 transition ${
                    isSorted && table.sortDirection === "desc"
                      ? "bg-amber-500 text-slate-950 border-amber-500 font-bold"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <ArrowDown className="w-3 h-3" />
                  <span>{column.type === "number" || column.type === "currency" ? "Largest" : "Z → A"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Search Box inside Excel Popover */}
          <div className="pt-2 pb-1.5">
            <div className="relative">
              <input
                type="text"
                placeholder="Search values..."
                value={colSearch}
                onChange={(e) =>
                  table.setFilterSearchQueries((prev) => ({
                    ...prev,
                    [column.key]: e.target.value,
                  }))
                }
                className="w-full pl-7 pr-6 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
              <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2 pointer-events-none" />
              {colSearch && (
                <button
                  type="button"
                  onClick={() =>
                    table.setFilterSearchQueries((prev) => ({
                      ...prev,
                      [column.key]: "",
                    }))
                  }
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Select All Toggle */}
          <div className="flex items-center justify-between py-1 px-1 bg-slate-50/70 rounded-md mb-1 border border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
              <input
                type="checkbox"
                checked={!isNoneSelected && !isIndeterminate}
                ref={(el) => {
                  if (el) el.indeterminate = isIndeterminate;
                }}
                onChange={(e) => {
                  if (e.target.checked) {
                    table.selectAllColumnValues(column.key, visibleValues.map((v) => v.value));
                  } else {
                    table.deselectAllColumnValues(column.key, visibleValues.map((v) => v.value));
                  }
                }}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
              />
              <span>(Select All)</span>
            </label>
            <span className="text-[10px] text-slate-400 font-semibold">
              {selectedCount} of {distinctValues.length}
            </span>
          </div>

          {/* Distinct Values Checklist */}
          <div className="max-h-44 overflow-y-auto space-y-0.5 divide-y divide-slate-50 pr-1">
            {visibleValues.length === 0 ? (
              <div className="py-4 text-center text-slate-400 text-xs italic">
                No matching values
              </div>
            ) : (
              visibleValues.map((item) => {
                const isChecked = allSelected || (selectedSet && selectedSet.has(item.value));
                return (
                  <label
                    key={item.value}
                    className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-slate-100/80 cursor-pointer text-xs transition"
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <input
                        type="checkbox"
                        checked={Boolean(isChecked)}
                        onChange={() => table.toggleFilterValue(column.key, item.value)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 shrink-0"
                      />
                      <span className={`truncate ${item.value === "(Blanks)" ? "italic text-slate-400" : "text-slate-800 font-medium"}`}>
                        {item.value === "(Blanks)" ? "(Empty)" : item.value}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0 bg-slate-100 px-1.5 py-0.2 rounded-full">
                      {item.count}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            {isFiltered ? (
              <button
                type="button"
                onClick={() => {
                  table.clearColumnFilter(column.key);
                }}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear Filter</span>
              </button>
            ) : (
              <span className="text-[10px] text-slate-400">All values active</span>
            )}

            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                onClick={() => {
                  table.setOpenFilterKey(null);
                  table.setActiveMegaColumnKey(column.key);
                  table.setIsMegaFilterOpen(true);
                }}
                className="px-2 py-1 text-slate-700 hover:text-slate-950 hover:bg-slate-100 text-[11px] font-bold rounded-lg transition inline-flex items-center gap-1 border border-slate-200 bg-white shadow-2xs"
                title="Open full Filter & Sort panel"
              >
                <SlidersHorizontal className="w-3 h-3 text-amber-500" />
                <span>Filter & Sort</span>
              </button>

              <button
                type="button"
                onClick={() => table.setOpenFilterKey(null)}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </th>
  );
}

/**
 * Mega Filter & Multi-Column Slicer Modal
 */
export function MegaFilterModal<T = any>({
  table,
  columns,
  tableName = "records",
  onClose,
}: {
  table: ReturnType<typeof useExcelTable<T>>;
  columns: ExcelColumn<T>[];
  tableName?: string;
  onClose?: () => void;
}) {
  const handleClose = useCallback(() => {
    if (onClose) onClose();
    else table.setIsMegaFilterOpen(false);
  }, [onClose, table]);
  const filterableColumns = useMemo(
    () => columns.filter((c) => c.filterable !== false),
    [columns]
  );

  const [columnSearch, setColumnSearch] = useState("");
  const [selectedColKey, setSelectedColKey] = useState<string>(
    table.activeMegaColumnKey || filterableColumns[0]?.key || ""
  );

  // Keep table's activeMegaColumnKey in sync
  useEffect(() => {
    if (table.activeMegaColumnKey && filterableColumns.some((c) => c.key === table.activeMegaColumnKey)) {
      setSelectedColKey(table.activeMegaColumnKey);
    }
  }, [table.activeMegaColumnKey, filterableColumns]);

  const activeColumn = filterableColumns.find((c) => c.key === selectedColKey) || filterableColumns[0];

  // Filter columns list by search query
  const visibleColumns = useMemo(() => {
    if (!columnSearch.trim()) return filterableColumns;
    const q = columnSearch.toLowerCase().trim();
    return filterableColumns.filter((c) => c.label.toLowerCase().includes(q));
  }, [filterableColumns, columnSearch]);

  // Lock background scroll and listen for Escape while MegaFilterModal is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose]);

  const activeKey = activeColumn ? activeColumn.key : "";
  const distinctValues = activeKey ? (table.distinctValuesMap[activeKey] || EMPTY_DISTINCT_VALUES) : EMPTY_DISTINCT_VALUES;
  const colSearch = activeKey ? (table.filterSearchQueries[activeKey] || "") : "";

  const visibleValues = useMemo(() => {
    if (!colSearch.trim()) return distinctValues;
    const q = colSearch.toLowerCase().trim();
    return distinctValues.filter((d) => d.value.toLowerCase().includes(q));
  }, [distinctValues, colSearch]);

  if (!activeColumn) return null;

  const selectedSet = table.columnFilters[activeColumn.key];
  const allSelected = !selectedSet;
  const selectedCount = allSelected
    ? distinctValues.length
    : distinctValues.filter((d) => selectedSet.has(d.value)).length;

  const currentRange = table.rangeFilters[activeColumn.key] || {};
  const hasRangeFilter =
    currentRange.min !== undefined ||
    currentRange.max !== undefined ||
    Boolean(currentRange.fromDate) ||
    Boolean(currentRange.toDate);

  const isColFiltered = Boolean(table.columnFilters[activeColumn.key]) || hasRangeFilter;

  const handleApplyPreset = (preset: "TODAY" | "7DAYS" | "THIS_MONTH" | "30DAYS" | "CLEAR") => {
    if (preset === "CLEAR") {
      table.clearRangeFilter(activeColumn.key);
      return;
    }
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    let fromDate = todayStr;
    const toDate = todayStr;

    if (preset === "7DAYS") {
      fromDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    } else if (preset === "30DAYS") {
      fromDate = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    } else if (preset === "THIS_MONTH") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    }

    table.setRangeFilter(activeColumn.key, {
      ...currentRange,
      fromDate,
      toDate,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden max-h-[90dvh] flex flex-col animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mega-filter-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="mega-filter-title" className="font-black text-base sm:text-lg leading-tight">
                  Filter & Sort — {tableName}
                </h3>
                {table.activeFiltersCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                    {table.activeFiltersCount} Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Filter and search across {filterableColumns.length} columns together
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800"
            aria-label="Close Filter & Sort"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Table Quick Search Banner inside Modal */}
        <div className="px-4 py-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center gap-3 shrink-0">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={`Search across all columns in ${tableName}...`}
              value={table.globalSearch}
              onChange={(e) => table.setGlobalSearch(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
            {table.globalSearch && (
              <button
                type="button"
                onClick={() => table.setGlobalSearch("")}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {table.activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={table.clearAllFilters}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All</span>
            </button>
          )}
        </div>

        {/* Two-Column Slicer Body */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left Column: Column Selector Navigation */}
          <div className="w-full md:w-64 max-h-40 md:max-h-none border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/60 flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-200">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Find column..."
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                  className="w-full pl-7 pr-6 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
                <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2 pointer-events-none" />
                {columnSearch && (
                  <button
                    type="button"
                    onClick={() => setColumnSearch("")}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-2 space-y-1">
              {visibleColumns.map((col) => {
                const isSelected = col.key === activeColumn.key;
                const colFiltered = Boolean(table.columnFilters[col.key]);
                const colRange = table.rangeFilters[col.key];
                const colHasRange =
                  colRange &&
                  (colRange.min !== undefined ||
                    colRange.max !== undefined ||
                    Boolean(colRange.fromDate) ||
                    Boolean(colRange.toDate));
                const colActive = colFiltered || colHasRange;
                const totalVals = table.distinctValuesMap[col.key]?.length || 0;

                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => {
                      setSelectedColKey(col.key);
                      table.setActiveMegaColumnKey(col.key);
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold transition text-left cursor-pointer ${
                      isSelected
                        ? "bg-amber-500 text-slate-950 font-bold shadow-xs"
                        : "hover:bg-slate-200/60 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      {col.type === "date" ? (
                        <Calendar className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-slate-950" : "text-slate-400"}`} />
                      ) : col.type === "number" || col.type === "currency" ? (
                        <Hash className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-slate-950" : "text-slate-400"}`} />
                      ) : (
                        <Type className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-slate-950" : "text-slate-400"}`} />
                      )}
                      <span className="truncate">{col.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {colActive && (
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isSelected ? "bg-slate-950" : "bg-amber-500"
                          }`}
                          title="Filter active on this column"
                        />
                      )}
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                          isSelected ? "bg-amber-600/30 text-slate-950" : "bg-slate-200/70 text-slate-500"
                        }`}
                      >
                        {totalVals}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Column Filter Controls */}
          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto md:overflow-hidden bg-white p-4 sm:p-5 space-y-4">
            {/* Active Column Header & Quick Presets */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sm sm:text-base text-slate-900">
                    {activeColumn.label}
                  </h4>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                    {activeColumn.type || "text"}
                  </span>
                  {isColFiltered && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      Filter Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {distinctValues.length} options in this column
                </p>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => table.selectAllColumnValues(activeColumn.key)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => table.deselectAllColumnValues(activeColumn.key)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                >
                  Deselect All
                </button>
                <button
                  type="button"
                  onClick={() => table.selectBlanksOnly(activeColumn.key)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                >
                  (Empty)
                </button>
                <button
                  type="button"
                  onClick={() => table.selectNonBlanksOnly(activeColumn.key)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                >
                  Has Value
                </button>
                {isColFiltered && (
                  <button
                    type="button"
                    onClick={() => {
                      table.clearColumnFilter(activeColumn.key);
                      table.clearRangeFilter(activeColumn.key);
                    }}
                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 transition flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Special Section: Date Range Picker for Date Columns */}
            {activeColumn.type === "date" && (
              <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-2.5 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-amber-600" />
                    <span>Date Range</span>
                  </span>
                  {(currentRange.fromDate || currentRange.toDate) && (
                    <button
                      type="button"
                      onClick={() => table.clearRangeFilter(activeColumn.key)}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700"
                    >
                      Clear Range
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">
                      From Date
                    </label>
                    <input
                      type="date"
                      value={currentRange.fromDate || ""}
                      onChange={(e) =>
                        table.setRangeFilter(activeColumn.key, {
                          ...currentRange,
                          fromDate: e.target.value || undefined,
                        })
                      }
                      className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">
                      To Date
                    </label>
                    <input
                      type="date"
                      value={currentRange.toDate || ""}
                      onChange={(e) =>
                        table.setRangeFilter(activeColumn.key, {
                          ...currentRange,
                          toDate: e.target.value || undefined,
                        })
                      }
                      className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Quick Date Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-400">Quick:</span>
                  {(["TODAY", "7DAYS", "THIS_MONTH", "30DAYS"] as const).map((preset) => {
                    const label =
                      preset === "TODAY"
                        ? "Today"
                        : preset === "7DAYS"
                        ? "Last 7 Days"
                        : preset === "THIS_MONTH"
                        ? "This Month"
                        : "Last 30 Days";
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleApplyPreset(preset)}
                        className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 text-[11px] font-semibold text-amber-900 border border-amber-200 transition"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Special Section: Min/Max Number Range for Numeric / Currency Columns */}
            {(activeColumn.type === "number" || activeColumn.type === "currency") && (
              <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-amber-600" />
                    <span>Number Range</span>
                  </span>
                  {(currentRange.min !== undefined || currentRange.max !== undefined) && (
                    <button
                      type="button"
                      onClick={() => table.clearRangeFilter(activeColumn.key)}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700"
                    >
                      Clear Range
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">
                      Minimum Value
                    </label>
                    <input
                      type="number"
                      placeholder="Min..."
                      value={currentRange.min !== undefined ? currentRange.min : ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? undefined : Number(e.target.value);
                        table.setRangeFilter(activeColumn.key, {
                          ...currentRange,
                          min: val,
                        });
                      }}
                      className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">
                      Maximum Value
                    </label>
                    <input
                      type="number"
                      placeholder="Max..."
                      value={currentRange.max !== undefined ? currentRange.max : ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? undefined : Number(e.target.value);
                        table.setRangeFilter(activeColumn.key, {
                          ...currentRange,
                          max: val,
                        });
                      }}
                      className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Distinct Values Checklist Section */}
            <div className="flex-1 flex flex-col min-h-0 space-y-2">
              <div className="flex items-center justify-between gap-2 shrink-0">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder={`Search options in ${activeColumn.label}...`}
                    value={colSearch}
                    onChange={(e) =>
                      table.setFilterSearchQueries((prev) => ({
                        ...prev,
                        [activeColumn.key]: e.target.value,
                      }))
                    }
                    className="w-full pl-7 pr-6 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  {colSearch && (
                    <button
                      type="button"
                      onClick={() =>
                        table.setFilterSearchQueries((prev) => ({
                          ...prev,
                          [activeColumn.key]: "",
                        }))
                      }
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="text-[11px] font-bold text-slate-500 shrink-0">
                  {selectedCount} of {distinctValues.length} active
                </div>
              </div>

              {/* Checklist Container */}
              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 pr-1 max-h-52">
                {visibleValues.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs italic">
                    No matching options found
                  </div>
                ) : (
                  visibleValues.map((item) => {
                    const isChecked = allSelected || (selectedSet && selectedSet.has(item.value));
                    return (
                      <label
                        key={item.value}
                        className="flex items-center justify-between py-1.5 px-3 hover:bg-slate-50 cursor-pointer text-xs transition"
                      >
                        <div className="flex items-center gap-2.5 truncate pr-2">
                          <input
                            type="checkbox"
                            checked={Boolean(isChecked)}
                            onChange={() => table.toggleFilterValue(activeColumn.key, item.value)}
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 shrink-0"
                          />
                          <span
                            className={`truncate ${
                              item.value === "(Blanks)" ? "italic text-slate-400" : "text-slate-800 font-medium"
                            }`}
                          >
                            {item.value === "(Blanks)" ? "(Empty)" : item.value}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                          {item.count}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            {table.activeFiltersCount > 0 ? (
              <button
                type="button"
                onClick={table.clearAllFilters}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-rose-50 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </button>
            ) : (
              <span className="text-slate-400">No active filters applied</span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <span className="text-xs text-slate-600 font-medium">
              Showing <strong className="text-slate-900 font-bold">{table.filteredCount}</strong> of{" "}
              <strong className="text-slate-700 font-bold">{table.totalRecords}</strong> {tableName}
            </span>
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Apply & View Results</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface DateRangeFilterConfig {
  startDate: string;
  endDate: string;
  onStartDateChange: (val: string) => void;
  onEndDateChange: (val: string) => void;
  onReset?: () => void;
}

/**
 * Inline Mega Filter Drawer matching the Advanced Search & Column Filters card layout
 */
export function ExcelTableMegaDrawer<T = any>({
  table,
  columns,
  tableName = "records",
  onOpenDeepModal,
  dateRangeFilter,
}: {
  table: ReturnType<typeof useExcelTable<T>>;
  columns: ExcelColumn<T>[];
  tableName?: string;
  onOpenDeepModal?: () => void;
  dateRangeFilter?: DateRangeFilterConfig;
}) {
  const filterableColumns = useMemo(
    () => columns.filter((c) => c.filterable !== false),
    [columns]
  );

  // 1. Identify primary date column
  const primaryDateCol = useMemo(() => {
    return filterableColumns.find(
      (c) => c.type === "date" || /date|time|at$|day/i.test(c.key)
    );
  }, [filterableColumns]);

  // 2. Identify primary numeric/currency column
  const primaryNumericCol = useMemo(() => {
    return filterableColumns.find(
      (c) =>
        c.type === "currency" ||
        c.type === "number" ||
        /amount|total|balance|wage|rate|cost|price|quantity|stock/i.test(c.key)
    );
  }, [filterableColumns]);

  // 3. Categorical columns (dropdowns)
  const categoricalCols = useMemo(() => {
    return filterableColumns
      .filter((c) => {
        if (primaryDateCol && c.key === primaryDateCol.key) return false;
        if (primaryNumericCol && c.key === primaryNumericCol.key) return false;
        const distinct = table.distinctValuesMap[c.key] || [];
        const hasFewDistinct = distinct.length >= 2 && distinct.length <= 40;
        const isKnownCategory = /status|role|site|project|account|method|category|department|type|gender|shift|verified/i.test(c.key);
        return hasFewDistinct || isKnownCategory;
      })
      .slice(0, 6);
  }, [filterableColumns, primaryDateCol, primaryNumericCol, table.distinctValuesMap]);

  // 4. Text/Search columns
  const searchCols = useMemo(() => {
    const catKeys = new Set(categoricalCols.map((c) => c.key));
    return filterableColumns
      .filter((c) => {
        if (primaryDateCol && c.key === primaryDateCol.key) return false;
        if (primaryNumericCol && c.key === primaryNumericCol.key) return false;
        if (catKeys.has(c.key)) return false;
        if (c.key.toLowerCase().includes("action") || c.key.toLowerCase().includes("image") || c.key.toLowerCase().includes("photo")) return false;
        return true;
      })
      .slice(0, 4);
  }, [filterableColumns, primaryDateCol, primaryNumericCol, categoricalCols]);

  const dateRange = (primaryDateCol && table.rangeFilters[primaryDateCol.key]) || {};
  const numRange = (primaryNumericCol && table.rangeFilters[primaryNumericCol.key]) || {};

  const isCustomDate = Boolean(dateRangeFilter);
  const showDateFilter = Boolean(primaryDateCol || isCustomDate);

  const effectiveFromDate = isCustomDate ? dateRangeFilter?.startDate : dateRange.fromDate;
  const effectiveToDate = isCustomDate ? dateRangeFilter?.endDate : dateRange.toDate;

  const handleFromDateChange = (val?: string) => {
    if (isCustomDate && dateRangeFilter) {
      dateRangeFilter.onStartDateChange(val || "");
    } else if (primaryDateCol) {
      table.setRangeFilter(primaryDateCol.key, { ...dateRange, fromDate: val });
    }
  };

  const handleToDateChange = (val?: string) => {
    if (isCustomDate && dateRangeFilter) {
      dateRangeFilter.onEndDateChange(val || "");
    } else if (primaryDateCol) {
      table.setRangeFilter(primaryDateCol.key, { ...dateRange, toDate: val });
    }
  };

  const handleClearFromDate = () => handleFromDateChange(undefined);
  const handleClearToDate = () => handleToDateChange(undefined);

  // Quick Date Handlers
  const handleDatePreset = (preset: "ALL" | "TODAY" | "7DAYS" | "THIS_MONTH" | "30DAYS") => {
    if (preset === "ALL") {
      if (isCustomDate && dateRangeFilter) {
        if (dateRangeFilter.onReset) dateRangeFilter.onReset();
        else {
          dateRangeFilter.onStartDateChange("");
          dateRangeFilter.onEndDateChange("");
        }
      } else if (primaryDateCol) {
        table.clearRangeFilter(primaryDateCol.key);
      }
      return;
    }
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    let from = "";
    let to = todayStr;

    if (preset === "TODAY") {
      from = todayStr;
    } else if (preset === "7DAYS") {
      const past = new Date(today);
      past.setDate(today.getDate() - 7);
      from = past.toISOString().split("T")[0];
    } else if (preset === "THIS_MONTH") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      from = firstDay.toISOString().split("T")[0];
    } else if (preset === "30DAYS") {
      const past = new Date(today);
      past.setDate(today.getDate() - 30);
      from = past.toISOString().split("T")[0];
    }

    if (isCustomDate && dateRangeFilter) {
      dateRangeFilter.onStartDateChange(from);
      dateRangeFilter.onEndDateChange(to);
    } else if (primaryDateCol) {
      table.setRangeFilter(primaryDateCol.key, { ...dateRange, fromDate: from, toDate: to });
    }
  };

  const isCustomDateActive = Boolean(isCustomDate && (dateRangeFilter?.startDate || dateRangeFilter?.endDate));
  const totalActiveFilters = table.activeFiltersCount + (isCustomDateActive ? 1 : 0);

  // Quick Amount Handlers
  const handleAmountPreset = (preset: "ALL" | "UNDER_50K" | "50K_2L" | "OVER_2L") => {
    if (!primaryNumericCol) return;
    if (preset === "ALL") {
      table.clearRangeFilter(primaryNumericCol.key);
      return;
    }
    if (preset === "UNDER_50K") {
      table.setRangeFilter(primaryNumericCol.key, { ...numRange, min: 0, max: 50000 });
    } else if (preset === "50K_2L") {
      table.setRangeFilter(primaryNumericCol.key, { ...numRange, min: 50000, max: 200000 });
    } else if (preset === "OVER_2L") {
      table.setRangeFilter(primaryNumericCol.key, { ...numRange, min: 200000, max: undefined });
    }
  };

  const getColIcon = (key: string) => {
    const k = key.toLowerCase();
    if (k.includes("account") || k.includes("bank")) return <Landmark className="w-3 h-3 text-slate-400" />;
    if (k.includes("method") || k.includes("pay") || k.includes("card")) return <CreditCard className="w-3 h-3 text-slate-400" />;
    if (k.includes("amount") || k.includes("cost") || k.includes("rate") || k.includes("price") || k.includes("wage") || k.includes("total")) return <Coins className="w-3 h-3 text-slate-400" />;
    if (k.includes("site") || k.includes("project") || k.includes("locat")) return <Building2 className="w-3 h-3 text-slate-400" />;
    if (k.includes("user") || k.includes("member") || k.includes("worker") || k.includes("role") || k.includes("person") || k.includes("party")) return <Users className="w-3 h-3 text-slate-400" />;
    if (k.includes("status") || k.includes("verif") || k.includes("state")) return <CheckCircle2 className="w-3 h-3 text-slate-400" />;
    if (k.includes("date") || k.includes("time") || k.includes("day")) return <Calendar className="w-3 h-3 text-slate-400" />;
    return <Tag className="w-3 h-3 text-slate-400" />;
  };

  return (
    <div className="bg-[#fcfbf7]/95 border-t border-slate-200/90 p-3 sm:p-4 space-y-3 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-amber-600" />
          <h4 className="text-xs sm:text-sm font-bold text-slate-900">
            Advanced Search & Column Filters
          </h4>
          {totalActiveFilters > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
              {totalActiveFilters} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {totalActiveFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                table.clearAllFilters();
                if (isCustomDate && dateRangeFilter) {
                  if (dateRangeFilter.onReset) dateRangeFilter.onReset();
                  else {
                    dateRangeFilter.onStartDateChange("");
                    dateRangeFilter.onEndDateChange("");
                  }
                }
              }}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
            >
              Reset All
            </button>
          )}

          {onOpenDeepModal && (
            <button
              type="button"
              onClick={onOpenDeepModal}
              className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 hidden sm:inline-flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-50 transition"
            >
              <Layers className="w-3 h-3 text-amber-500" />
              <span>More Filters...</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => table.setIsMegaFilterOpen(false)}
            className="text-slate-400 hover:text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <span>Close</span>
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Date: From Date */}
        {showDateFilter && (
          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>From Date</span>
              </span>
              {effectiveFromDate && (
                <button
                  type="button"
                  onClick={handleClearFromDate}
                  className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </label>
            <input
              type="date"
              value={effectiveFromDate || ""}
              onChange={(e) => handleFromDateChange(e.target.value || undefined)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
        )}

        {/* Date: To Date */}
        {showDateFilter && (
          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>To Date</span>
              </span>
              {effectiveToDate && (
                <button
                  type="button"
                  onClick={handleClearToDate}
                  className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </label>
            <input
              type="date"
              value={effectiveToDate || ""}
              onChange={(e) => handleToDateChange(e.target.value || undefined)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
        )}

        {/* Categorical Select Dropdowns */}
        {categoricalCols.map((col) => {
          const distinct = table.distinctValuesMap[col.key] || [];
          const currentFilter = table.columnFilters[col.key];
          const selectedVal =
            currentFilter && currentFilter.size === 1
              ? Array.from(currentFilter)[0]
              : currentFilter
              ? "MULTIPLE"
              : "ALL";
          const isFiltered = Boolean(currentFilter);

          return (
            <div key={col.key} className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
              <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 truncate">
                  {getColIcon(col.key)}
                  <span className="truncate">{col.label}</span>
                </span>
                {isFiltered && (
                  <button
                    type="button"
                    onClick={() => table.clearColumnFilter(col.key)}
                    className="text-[10px] text-rose-600 hover:underline cursor-pointer shrink-0 ml-1"
                  >
                    Clear
                  </button>
                )}
              </label>
              <select
                value={selectedVal}
                onChange={(e) => table.setSingleColumnValue(col.key, e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 truncate"
              >
                <option value="ALL">All {col.label} ({distinct.length})</option>
                {selectedVal === "MULTIPLE" && (
                  <option value="MULTIPLE" disabled>
                    (Multiple selected)
                  </option>
                )}
                {distinct.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.value === "(Blanks)" ? "(Empty)" : item.value} ({item.count})
                  </option>
                ))}
              </select>
            </div>
          );
        })}

        {/* Text Search Columns */}
        {searchCols.map((col) => {
          const query = table.textFilters[col.key] || "";
          const isFiltered = Boolean(query.trim());

          return (
            <div key={col.key} className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-700 truncate">
                  {col.label}
                </label>
                {isFiltered && (
                  <button
                    type="button"
                    onClick={() => table.clearTextFilter(col.key)}
                    className="text-[10px] text-rose-600 hover:underline cursor-pointer shrink-0 ml-1"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => table.setTextFilter(col.key, e.target.value)}
                placeholder={
                  col.key.toLowerCase().includes("reason")
                    ? "e.g. advance, cement, query..."
                    : col.key.toLowerCase().includes("bill")
                    ? "e.g. Bill #, unallocated..."
                    : `e.g. Search ${col.label.toLowerCase()}...`
                }
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          );
        })}

        {/* Min Numeric Range */}
        {primaryNumericCol && (
          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700">
                Min {primaryNumericCol.label} {primaryNumericCol.type === "currency" || /amount|balance|cost|wage|rate|price/i.test(primaryNumericCol.key) ? "(₹)" : ""}
              </label>
              {numRange.min !== undefined && (
                <button
                  type="button"
                  onClick={() =>
                    table.setRangeFilter(primaryNumericCol.key, { ...numRange, min: undefined })
                  }
                  className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <input
              type="number"
              min="0"
              step="any"
              value={numRange.min ?? ""}
              onChange={(e) =>
                table.setRangeFilter(primaryNumericCol.key, {
                  ...numRange,
                  min: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="₹ Min (e.g. 1000)"
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
        )}

        {/* Max Numeric Range */}
        {primaryNumericCol && (
          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700">
                Max {primaryNumericCol.label} {primaryNumericCol.type === "currency" || /amount|balance|cost|wage|rate|price/i.test(primaryNumericCol.key) ? "(₹)" : ""}
              </label>
              {numRange.max !== undefined && (
                <button
                  type="button"
                  onClick={() =>
                    table.setRangeFilter(primaryNumericCol.key, { ...numRange, max: undefined })
                  }
                  className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <input
              type="number"
              min="0"
              step="any"
              value={numRange.max ?? ""}
              onChange={(e) =>
                table.setRangeFilter(primaryNumericCol.key, {
                  ...numRange,
                  max: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="₹ Max (e.g. 50000)"
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
        )}
      </div>

      {/* Quick Presets Row */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-y-2.5 gap-x-4 pt-1 text-xs">
        {/* Quick Amount Presets */}
        {primaryNumericCol && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 shrink-0">Quick Amount:</span>
            <div className="flex items-center gap-1.5 overflow-x-auto sm:flex-wrap pb-0.5 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              { key: "ALL", label: "All Amounts" },
              { key: "UNDER_50K", label: "< ₹50,000" },
              { key: "50K_2L", label: "₹50,000 – ₹2,00,000" },
              { key: "OVER_2L", label: "> ₹2,00,000" },
            ].map((p) => {
              const isSelected =
                (p.key === "ALL" && numRange.min === undefined && numRange.max === undefined) ||
                (p.key === "UNDER_50K" && numRange.min === 0 && numRange.max === 50000) ||
                (p.key === "50K_2L" && numRange.min === 50000 && numRange.max === 200000) ||
                (p.key === "OVER_2L" && numRange.min === 200000 && numRange.max === undefined);

              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handleAmountPreset(p.key as any)}
                  className={`px-2.5 py-1 sm:px-2 sm:py-0.5 rounded-md sm:rounded text-[11px] sm:text-[10px] font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
                    isSelected
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            </div>
          </div>
        )}

        {/* Quick Date Presets */}
        {showDateFilter && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 shrink-0">Quick Dates:</span>
            <div className="flex items-center gap-1.5 overflow-x-auto sm:flex-wrap pb-0.5 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              { key: "ALL", label: "All Dates" },
              { key: "TODAY", label: "Today" },
              { key: "7DAYS", label: "Last 7 Days" },
              { key: "THIS_MONTH", label: "This Month" },
              { key: "30DAYS", label: "Last 30 Days" },
            ].map((p) => {
              const isSelected =
                (p.key === "ALL" && !effectiveFromDate && !effectiveToDate);

              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handleDatePreset(p.key as any)}
                  className={`px-2.5 py-1 sm:px-2 sm:py-0.5 rounded-md sm:rounded text-[11px] sm:text-[10px] font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
                    isSelected
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * DataTables-style "Show [ 10 ] entries" page-size selector.
 */
export function ShowEntriesControl({
  pageSize,
  onPageSizeChange,
  className = "",
  id,
}: {
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  className?: string;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 shrink-0 print:hidden ${className}`}
    >
      <span>Show</span>
      <select
        id={id}
        aria-label="Show entries"
        value={String(pageSize)}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        className="w-auto min-w-[64px] shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer"
      >
        {PAGE_SIZE_OPTIONS.map((opt) => (
          <option key={opt} value={String(opt)}>
            {opt === 0 ? "All" : opt}
          </option>
        ))}
      </select>
      <span>entries</span>
    </label>
  );
}

/**
 * DataTables-style footer bar: "Showing X to Y of Z entries" and segmented [« | ‹ | 1 | 2 | › | »].
 */
export function TablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  startItem,
  endItem,
  onPageChange,
  totalUnfiltered,
  itemLabel = "entries",
  className = "",
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize?: number;
  startItem: number;
  endItem: number;
  onPageChange: (page: number) => void;
  totalUnfiltered?: number;
  itemLabel?: string;
  className?: string;
}) {
  if (totalItems === 0 && (!totalUnfiltered || totalUnfiltered === 0)) {
    return null;
  }

  const resolvedTotalPages = Math.max(1, totalPages || 1);
  const safeCurrent = Math.min(Math.max(1, currentPage || 1), resolvedTotalPages);
  const isFirst = safeCurrent <= 1;
  const isLast = safeCurrent >= resolvedTotalPages;
  const isFiltered =
    typeof totalUnfiltered === "number" && totalUnfiltered > totalItems;
  const range = getPaginationRange(safeCurrent, resolvedTotalPages);

  return (
    <div
      className={`px-3 py-2.5 bg-slate-50/80 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs print:hidden ${className}`}
    >
      <div className="text-slate-600 font-medium">
        {totalItems === 0 ? (
          <span>
            Showing <strong className="text-slate-900 font-semibold">0</strong> of{" "}
            <strong className="text-slate-900 font-semibold">0</strong> {itemLabel}
            {isFiltered ? ` (filtered from ${totalUnfiltered} total)` : ""}
          </span>
        ) : pageSize === 0 ? (
          <span>
            Showing <strong className="text-slate-900 font-semibold">1</strong> to{" "}
            <strong className="text-slate-900 font-semibold">{totalItems}</strong> of{" "}
            <strong className="text-slate-900 font-semibold">{totalItems}</strong> {itemLabel}
            {isFiltered ? ` (filtered from ${totalUnfiltered} total)` : ""}
          </span>
        ) : (
          <span>
            Showing <strong className="text-slate-900 font-semibold">{startItem}</strong> to{" "}
            <strong className="text-slate-900 font-semibold">{endItem}</strong> of{" "}
            <strong className="text-slate-900 font-semibold">{totalItems}</strong> {itemLabel}
            {isFiltered ? ` (filtered from ${totalUnfiltered} total)` : ""}
          </span>
        )}
      </div>

      <nav
        aria-label="Table pagination"
        className="inline-flex flex-wrap items-stretch self-start sm:self-auto rounded-md border border-slate-200 bg-white divide-x divide-slate-200 overflow-hidden shadow-2xs"
      >
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={isFirst}
          aria-label="First page"
          title="First page"
          className={`min-w-[32px] h-8 px-2.5 flex items-center justify-center text-xs transition ${
            isFirst
              ? "text-slate-300 cursor-not-allowed bg-white"
              : "text-sky-600 hover:bg-slate-50 cursor-pointer"
          }`}
        >
          &laquo;
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safeCurrent - 1))}
          disabled={isFirst}
          aria-label="Previous page"
          title="Previous page"
          className={`min-w-[32px] h-8 px-2.5 flex items-center justify-center text-xs transition ${
            isFirst
              ? "text-slate-300 cursor-not-allowed bg-white"
              : "text-sky-600 hover:bg-slate-50 cursor-pointer"
          }`}
        >
          &lsaquo;
        </button>

        {range.map((item, idx) =>
          item === "..." ? (
            <span
              key={`ellipsis-${idx}`}
              className="min-w-[30px] h-8 px-2 flex items-center justify-center text-xs text-slate-400 select-none bg-white"
            >
              &hellip;
            </span>
          ) : (
            <button
              key={`page-${item}`}
              type="button"
              onClick={() => onPageChange(item)}
              aria-label={`Page ${item}`}
              aria-current={item === safeCurrent ? "page" : undefined}
              className={`min-w-[32px] h-8 px-2.5 flex items-center justify-center text-xs transition cursor-pointer ${
                item === safeCurrent
                  ? "bg-slate-100 text-slate-900 font-bold"
                  : "bg-white text-sky-600 hover:bg-slate-50 font-medium"
              }`}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(resolvedTotalPages, safeCurrent + 1))}
          disabled={isLast}
          aria-label="Next page"
          title="Next page"
          className={`min-w-[32px] h-8 px-2.5 flex items-center justify-center text-xs transition ${
            isLast
              ? "text-slate-300 cursor-not-allowed bg-white"
              : "text-sky-600 hover:bg-slate-50 cursor-pointer"
          }`}
        >
          &rsaquo;
        </button>
        <button
          type="button"
          onClick={() => onPageChange(resolvedTotalPages)}
          disabled={isLast}
          aria-label="Last page"
          title="Last page"
          className={`min-w-[32px] h-8 px-2.5 flex items-center justify-center text-xs transition ${
            isLast
              ? "text-slate-300 cursor-not-allowed bg-white"
              : "text-sky-600 hover:bg-slate-50 cursor-pointer"
          }`}
        >
          &raquo;
        </button>
      </nav>
    </div>
  );
}

/**
 * Excel Table Active Filter Toolbar
 */
export function ExcelTableToolbar<T = any>({
  table,
  columns,
  tableName = "records",
  showSearch = true,
  showExport = true,
  showEntries = true,
  dateRangeFilter,
}: {
  table: ReturnType<typeof useExcelTable<T>>;
  columns: ExcelColumn<T>[];
  tableName?: string;
  showSearch?: boolean;
  showExport?: boolean;
  showEntries?: boolean;
  dateRangeFilter?: DateRangeFilterConfig;
}) {
  const [isDeepModalOpen, setIsDeepModalOpen] = useState(false);
  const activeColFilterKeys = Object.keys(table.columnFilters);
  const activeRangeFilterKeys = Object.keys(table.rangeFilters);
  const activeTextFilterKeys = Object.keys(table.textFilters || {});
  const isCustomDateActive = Boolean(dateRangeFilter && (dateRangeFilter.startDate || dateRangeFilter.endDate));
  const effectiveActiveCount = table.activeFiltersCount + (isCustomDateActive ? 1 : 0);
  const hasActiveFilters =
    activeColFilterKeys.length > 0 ||
    activeRangeFilterKeys.length > 0 ||
    activeTextFilterKeys.length > 0 ||
    Boolean(table.globalSearch);

  return (
    <div className="border-b border-slate-200 bg-slate-50/80">
      <div className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        {/* Left: Global Search & Mega Filter toggle & Active Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 flex-1 w-full md:w-auto">
          {showSearch && (
            <div className="relative w-full sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
              <input
                type="text"
                placeholder={`Quick search ${tableName}...`}
                value={table.globalSearch}
                onChange={(e) => table.setGlobalSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-amber-500 focus:outline-none shadow-2xs"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
              {table.globalSearch && (
                <button
                  type="button"
                  onClick={() => table.setGlobalSearch("")}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Mega Filter Button */}
          <button
            type="button"
            onClick={() => table.setIsMegaFilterOpen(!table.isMegaFilterOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer shrink-0 ${
              table.isMegaFilterOpen || effectiveActiveCount > 0
                ? "bg-amber-500 hover:bg-amber-400 text-slate-950 ring-2 ring-amber-300 shadow-amber-500/20"
                : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
            }`}
            title={`Show or hide filters for ${tableName}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-950" />
            <span>Filter & Sort</span>
            {effectiveActiveCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-slate-950 text-amber-400">
                {effectiveActiveCount}
              </span>
            )}
          </button>

          {/* Active Custom Date Filter Chip */}
          {isCustomDateActive && dateRangeFilter && (
            <span
              key="custom-date-range-chip"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg font-semibold text-xs shadow-2xs"
            >
              <Calendar className="w-3 h-3 text-amber-600" />
              <span>Date:</span>
              <strong className="font-bold text-amber-950">
                {dateRangeFilter.startDate || "Start"} to {dateRangeFilter.endDate || "Present"}
              </strong>
              <button
                type="button"
                onClick={() => {
                  if (dateRangeFilter.onReset) dateRangeFilter.onReset();
                  else {
                    dateRangeFilter.onStartDateChange("");
                    dateRangeFilter.onEndDateChange("");
                  }
                }}
                className="text-amber-700 hover:text-amber-950 p-0.5 rounded-full hover:bg-amber-100 transition"
                title="Remove date filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Active Checklist Filter Chips */}
          {activeColFilterKeys.map((colKey) => {
            const col = columns.find((c) => c.key === colKey);
            const selected = table.columnFilters[colKey];
            const totalVals = table.distinctValuesMap[colKey]?.length || 0;
            if (!col || !selected) return null;

            return (
              <span
                key={colKey}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg font-semibold text-xs shadow-2xs"
              >
                <span>{col.label}:</span>
                <strong className="font-bold text-amber-950">
                  {selected.size === 1
                    ? Array.from(selected)[0]
                    : `${selected.size} of ${totalVals} selected`}
                </strong>
                <button
                  type="button"
                  onClick={() => table.clearColumnFilter(colKey)}
                  className="text-amber-700 hover:text-amber-950 p-0.5 rounded-full hover:bg-amber-100 transition"
                  title={`Remove ${col.label} filter`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}

          {/* Active Range Filter Chips */}
          {Object.entries(table.rangeFilters).map(([colKey, range]) => {
            const col = columns.find((c) => c.key === colKey);
            if (!col) return null;
            const parts: string[] = [];
            if (range.min !== undefined && range.max !== undefined) parts.push(`${range.min} to ${range.max}`);
            else if (range.min !== undefined) parts.push(`≥ ${range.min}`);
            else if (range.max !== undefined) parts.push(`≤ ${range.max}`);
            if (range.fromDate && range.toDate) parts.push(`${range.fromDate} to ${range.toDate}`);
            else if (range.fromDate) parts.push(`from ${range.fromDate}`);
            else if (range.toDate) parts.push(`to ${range.toDate}`);
            if (parts.length === 0) return null;

            return (
              <span
                key={`range-${colKey}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg font-semibold text-xs shadow-2xs"
              >
                <span>{col.label}:</span>
                <strong className="font-bold text-amber-950">{parts.join(", ")}</strong>
                <button
                  type="button"
                  onClick={() => table.clearRangeFilter(colKey)}
                  className="text-amber-700 hover:text-amber-950 p-0.5 rounded-full hover:bg-amber-100 transition"
                  title={`Remove ${col.label} range filter`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}

          {/* Active Text Filter Chips */}
          {activeTextFilterKeys.map((colKey) => {
            const col = columns.find((c) => c.key === colKey);
            const val = table.textFilters[colKey];
            if (!col || !val) return null;

            return (
              <span
                key={`text-${colKey}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg font-semibold text-xs shadow-2xs"
              >
                <span>{col.label}:</span>
                <strong className="font-bold text-amber-950">&ldquo;{val}&rdquo;</strong>
                <button
                  type="button"
                  onClick={() => table.clearTextFilter(colKey)}
                  className="text-amber-700 hover:text-amber-950 p-0.5 rounded-full hover:bg-amber-100 transition"
                  title={`Remove ${col.label} text filter`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}

          {(hasActiveFilters || isCustomDateActive) && (
            <button
              type="button"
              onClick={() => {
                table.clearAllFilters();
                if (dateRangeFilter) {
                  if (dateRangeFilter.onReset) dateRangeFilter.onReset();
                  else {
                    dateRangeFilter.onStartDateChange("");
                    dateRangeFilter.onEndDateChange("");
                  }
                }
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-xs transition shadow-2xs"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Clear All</span>
            </button>
          )}
        </div>

        {/* Right: Show Entries, Record Counter & Export */}
        <div className="flex flex-wrap items-center justify-between md:justify-end gap-x-3 gap-y-2 w-full md:w-auto md:shrink-0 pt-2 md:pt-0 border-t border-slate-200/70 md:border-t-0">
          {showEntries && (
            <div className="order-1">
              <ShowEntriesControl
                pageSize={table.pageSize}
                onPageSizeChange={table.setPageSize}
              />
            </div>
          )}
          <span className="order-3 md:order-2 w-full md:w-auto text-[11px] sm:text-xs text-slate-500 font-medium">
            Showing{" "}
            <strong className="text-slate-900 font-bold">
              {table.filteredCount === 0 ? 0 : `${table.startItem}–${table.endItem}`}
            </strong>{" "}
            of <strong className="text-slate-700 font-bold">{table.filteredCount}</strong> {tableName}
            {table.totalRecords > table.filteredCount ? ` (${table.totalRecords} total)` : ""}
          </span>

          {showExport && table.filteredCount > 0 && (
            <button
              type="button"
              onClick={() => table.exportCSV(`${tableName}-filtered.csv`)}
              className="order-2 md:order-3 ml-auto md:ml-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg font-bold text-xs whitespace-nowrap shadow-2xs transition shrink-0"
              title="Download visible rows as a spreadsheet (CSV)"
            >
              <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Mega Filter Drawer (matching the user's screenshot) */}
      {table.isMegaFilterOpen && (
        <ExcelTableMegaDrawer
          table={table}
          columns={columns}
          tableName={tableName}
          onOpenDeepModal={() => setIsDeepModalOpen(true)}
          dateRangeFilter={dateRangeFilter}
        />
      )}

      {/* Deep Multi-Column Slicer Modal Portal */}
      {isDeepModalOpen && typeof document !== "undefined" && createPortal(
        <MegaFilterModal table={table} columns={columns} tableName={tableName} onClose={() => setIsDeepModalOpen(false)} />,
        document.body
      )}
    </div>
  );
}

/**
 * Turnkey Excel-like Table Component
 */
export default function ExcelTable<T = any>({
  data,
  columns,
  keyField,
  tableName = "records",
  showGlobalSearch = true,
  showExport = true,
  showToolbar = true,
  showEntries = true,
  emptyMessage = "No matching records found.",
  pageSize = DEFAULT_PAGE_SIZE,
  className = "",
  tableClassName = "",
  theme = "lightHeader",
  onRowClick,
  actionsHeader,
  renderRowActions,
}: ExcelTableProps<T>) {
  const table = useExcelTable({ data, columns, pageSize });

  const getRowKey = (row: T, index: number): string => {
    if (typeof keyField === "function") return String(keyField(row, index));
    if (keyField && (row as any)[keyField]) return String((row as any)[keyField]);
    if ((row as any).id) return String((row as any).id);
    return `row-${index}`;
  };

  const isDark = theme === "darkHeader";

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs md:min-h-[400px] ${className}`}>
      {/* Top Excel Toolbar */}
      {showToolbar && (
        <ExcelTableToolbar
          table={table}
          columns={columns}
          tableName={tableName}
          showSearch={showGlobalSearch}
          showExport={showExport}
          showEntries={showEntries}
        />
      )}

      {/* Table Container */}
      <div className="overflow-x-auto md:min-h-[400px]">
        <table className={`w-full text-left text-xs min-w-[640px] ${tableClassName}`}>
          <thead
            className={`${
              isDark ? "bg-slate-900 text-slate-200" : "bg-slate-50 text-slate-700"
            } uppercase tracking-wider font-semibold border-b border-slate-200`}
          >
            <tr>
              {columns.map((col) => (
                <ExcelColumnHeader key={col.key} column={col} table={table} theme={theme} />
              ))}
              {renderRowActions && (
                <th
                  className={`p-3 text-right text-xs font-semibold ${
                    isDark ? "text-slate-200" : "text-slate-700"
                  }`}
                >
                  {actionsHeader || "Actions"}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (renderRowActions ? 1 : 0)}
                  className="p-8 text-center text-slate-400 h-[300px] align-middle"
                >
                  <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600">{emptyMessage}</p>
                  {table.activeFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={table.clearAllFilters}
                      className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Filters</span>
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              table.paginatedData.map((row, idx) => (
                <tr
                  key={getRowKey(row, idx)}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`hover:bg-slate-50/80 transition ${
                    onRowClick ? "cursor-pointer" : ""
                  }`}
                >
                  {columns.map((col) => {
                    const cellVal = table.getCellValue(row, col);
                    return (
                      <td
                        key={col.key}
                        className={`p-3 text-slate-700 break-words whitespace-normal ${col.className || ""} ${
                          col.align === "right"
                            ? "text-right"
                            : col.align === "center"
                            ? "text-center"
                            : "text-left"
                        }`}
                      >
                        {col.render ? col.render(row, cellVal) : cellVal}
                      </td>
                    );
                  })}
                  {renderRowActions && (
                    <td className="p-3 text-right shrink-0">
                      {renderRowActions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <TablePagination
        currentPage={table.currentPage}
        totalPages={table.totalPages}
        totalItems={table.filteredCount}
        totalUnfiltered={table.totalRecords}
        pageSize={table.pageSize}
        startItem={table.startItem}
        endItem={table.endItem}
        onPageChange={table.setCurrentPage}
        itemLabel={tableName}
      />
    </div>
  );
}
