"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  Layers,
  Sparkles,
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

export interface ExcelTableProps<T = any> {
  data: T[];
  columns: ExcelColumn<T>[];
  keyField?: keyof T | ((row: T, index: number) => string | number);
  tableName?: string;
  showGlobalSearch?: boolean;
  showExport?: boolean;
  showToolbar?: boolean;
  emptyMessage?: string;
  pageSize?: number; // 0 or undefined for no pagination
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
  pageSize = 0,
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
  const [isMegaFilterOpen, setIsMegaFilterOpen] = useState(false);
  const [activeMegaColumnKey, setActiveMegaColumnKey] = useState<string>(columns[0]?.key || "");
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [filterSearchQueries, setFilterSearchQueries] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);

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
  }, [data, columns, globalSearch, columnFilters, rangeFilters, sortColumnKey, sortDirection, getCellValue]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [globalSearch, columnFilters, rangeFilters, sortColumnKey, sortDirection]);

  // Pagination slice
  const paginatedData = useMemo(() => {
    if (!pageSize || pageSize <= 0) return filteredData;
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const totalPages = pageSize && pageSize > 0 ? Math.ceil(filteredData.length / pageSize) : 1;

  // Active filter count (checklist filters + active range filters + global search)
  const activeFiltersCount =
    Object.keys(columnFilters).length +
    Object.values(rangeFilters).filter(
      (r) =>
        r.min !== undefined ||
        r.max !== undefined ||
        Boolean(r.fromDate) ||
        Boolean(r.toDate)
    ).length +
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

  const clearAllFilters = () => {
    setColumnFilters({});
    setRangeFilters({});
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

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return {
    filteredData,
    paginatedData,
    currentPage,
    setCurrentPage,
    totalPages,
    totalRecords: data.length,
    filteredCount: filteredData.length,
    globalSearch,
    setGlobalSearch,
    sortColumnKey,
    sortDirection,
    handleSort,
    columnFilters,
    rangeFilters,
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
  const popoverRef = useRef<HTMLDivElement>(null);
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

  // Close on outside click or Esc
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        table.setOpenFilterKey(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") table.setOpenFilterKey(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, table]);

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
            title={`Excel Filter: ${column.label} ${isFiltered ? "(Filter Active)" : ""}`}
          >
            <Filter className={`w-3.5 h-3.5 ${isFiltered ? "stroke-[2.5]" : ""}`} />
            {isFiltered && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full ring-1 ring-white" />
            )}
          </button>
        )}
      </div>

      {/* Excel Filter Popover Menu */}
      {isOpen && (
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-full z-50 mt-1 w-64 bg-white rounded-xl border border-slate-200 shadow-2xl p-3 text-slate-800 text-xs text-left normal-case tracking-normal animate-in fade-in zoom-in-95 duration-150 right-0 sm:right-auto"
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
                        {item.value}
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
                title="Open full Mega Filter panel"
              >
                <SlidersHorizontal className="w-3 h-3 text-amber-500" />
                <span>Mega Filter</span>
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
        </div>
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
}: {
  table: ReturnType<typeof useExcelTable<T>>;
  columns: ExcelColumn<T>[];
  tableName?: string;
}) {
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

  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") table.setIsMegaFilterOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [table]);

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
        if (e.target === e.currentTarget) table.setIsMegaFilterOpen(false);
      }}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150"
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
                  Mega Filter — {tableName}
                </h3>
                {table.activeFiltersCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                    {table.activeFiltersCount} Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Slice, search, and refine records across {filterableColumns.length} columns simultaneously
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => table.setIsMegaFilterOpen(false)}
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800"
            aria-label="Close Mega Filter"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Table Quick Search Banner inside Modal */}
        <div className="px-4 py-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center gap-3 shrink-0">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={`Global search in ${tableName} (searches across all columns)...`}
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
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[380px] max-h-[500px]">
          {/* Left Column: Column Selector Navigation */}
          <div className="w-full md:w-64 border-r border-slate-200 bg-slate-50/60 flex flex-col shrink-0">
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
          <div className="flex-1 flex flex-col overflow-hidden bg-white p-4 sm:p-5 space-y-4">
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
                  {distinctValues.length} distinct values in this dataset
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
                  (Blanks)
                </button>
                <button
                  type="button"
                  onClick={() => table.selectNonBlanksOnly(activeColumn.key)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                >
                  Non-Blanks
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
                    <span>Date Range Slicer</span>
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
                    <span>Numeric Range Slicer</span>
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
                    placeholder={`Search distinct values in ${activeColumn.label}...`}
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
                    No matching distinct values found
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
                            {item.value}
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
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
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
              onClick={() => table.setIsMegaFilterOpen(false)}
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

/**
 * Excel Table Active Filter Toolbar
 */
export function ExcelTableToolbar<T = any>({
  table,
  columns,
  tableName = "records",
  showSearch = true,
  showExport = true,
}: {
  table: ReturnType<typeof useExcelTable<T>>;
  columns: ExcelColumn<T>[];
  tableName?: string;
  showSearch?: boolean;
  showExport?: boolean;
}) {
  const activeColFilterKeys = Object.keys(table.columnFilters);
  const activeRangeFilterKeys = Object.keys(table.rangeFilters);
  const hasActiveFilters = activeColFilterKeys.length > 0 || activeRangeFilterKeys.length > 0 || Boolean(table.globalSearch);

  return (
    <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
      {/* Left: Global Search & Mega Filter & Active Filter Chips */}
      <div className="flex flex-wrap items-center gap-2 flex-1">
        {showSearch && (
          <div className="relative min-w-[180px] max-w-xs w-full">
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
          onClick={() => table.setIsMegaFilterOpen(true)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer shrink-0 ${
            table.activeFiltersCount > 0
              ? "bg-amber-500 hover:bg-amber-400 text-slate-950 ring-2 ring-amber-300 shadow-amber-500/20"
              : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
          }`}
          title={`Open Mega Filter for ${tableName}`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-950" />
          <span>Mega Filter</span>
          {table.activeFiltersCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-slate-950 text-amber-400">
              {table.activeFiltersCount}
            </span>
          )}
        </button>

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

        {hasActiveFilters && (
          <button
            type="button"
            onClick={table.clearAllFilters}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-xs transition shadow-2xs"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear All</span>
          </button>
        )}
      </div>

      {/* Right: Record Counter & Export */}
      <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
        <span className="text-slate-500 font-medium">
          Showing <strong className="text-slate-900 font-bold">{table.filteredCount}</strong> of{" "}
          <strong className="text-slate-700 font-bold">{table.totalRecords}</strong> {tableName}
        </span>

        {showExport && table.filteredCount > 0 && (
          <button
            type="button"
            onClick={() => table.exportCSV(`${tableName}-filtered.csv`)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg font-bold text-xs shadow-2xs transition"
            title="Export filtered records to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
        )}
      </div>

      {/* Mega Filter Modal Portal */}
      {table.isMegaFilterOpen && typeof document !== "undefined" && createPortal(
        <MegaFilterModal table={table} columns={columns} tableName={tableName} />,
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
  emptyMessage = "No matching records found.",
  pageSize = 0,
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
    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs min-h-[400px] ${className}`}>
      {/* Top Excel Toolbar */}
      {showToolbar && (
        <ExcelTableToolbar
          table={table}
          columns={columns}
          tableName={tableName}
          showSearch={showGlobalSearch}
          showExport={showExport}
        />
      )}

      {/* Table Container */}
      <div className="overflow-x-auto min-h-[400px]">
        <table className={`w-full text-left text-xs min-h-[400px] min-w-[640px] ${tableClassName}`}>
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

      {/* Pagination Bar (if enabled) */}
      {pageSize > 0 && table.totalPages > 1 && (
        <div className="p-3 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">
            Page <strong className="text-slate-900">{table.currentPage}</strong> of{" "}
            <strong className="text-slate-900">{table.totalPages}</strong>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={table.currentPage <= 1}
              onClick={() => table.setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={table.currentPage >= table.totalPages}
              onClick={() => table.setCurrentPage((p) => Math.min(table.totalPages, p + 1))}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
