"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, ChevronDown, Check, X, Users, UserCheck } from "lucide-react";

export interface MultiSelectOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
}

export interface SearchableMultiSelectProps {
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  unassignedLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export default function SearchableMultiSelect({
  options = [],
  values = [],
  onChange,
  placeholder = "Select employees...",
  searchPlaceholder = "Search employee name or role...",
  unassignedLabel = "Unassigned / Current User",
  disabled = false,
  className = "",
  id,
}: SearchableMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const safeOptions = useMemo(
    () => (Array.isArray(options) ? options.filter(Boolean) : []),
    [options]
  );
  const safeValues = useMemo(
    () => (Array.isArray(values) ? values : []),
    [values]
  );

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return safeOptions;

    const terms = q.split(/\s+/).filter(Boolean);
    return safeOptions.filter((opt) => {
      const searchTarget = `${opt?.label || ""} ${opt?.subLabel || ""} ${opt?.badge || ""}`.toLowerCase();
      return terms.every((term) => searchTarget.includes(term));
    });
  }, [safeOptions, searchQuery]);

  // Selected option objects
  const selectedOptions = useMemo(() => {
    const set = new Set(safeValues);
    return safeOptions.filter((opt) => opt && set.has(opt.value));
  }, [safeOptions, safeValues]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: Event) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("pointerdown", handleClickOutside);
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const toggleOption = (optValue: string) => {
    if (!optValue) {
      // Cleared / Unassigned
      onChange?.([]);
      return;
    }
    if (safeValues.includes(optValue)) {
      onChange?.(safeValues.filter((v) => v !== optValue));
    } else {
      onChange?.([...safeValues, optValue]);
    }
  };

  const removeValue = (e: React.MouseEvent, optValue: string) => {
    e.stopPropagation();
    onChange?.(safeValues.filter((v) => v !== optValue));
  };

  const selectAll = () => {
    const all = safeOptions.map((o) => o.value).filter(Boolean);
    onChange?.(all);
  };

  const clearAll = () => {
    onChange?.([]);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      id={id ? `${id}-container` : undefined}
    >
      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 bg-white border rounded-xl text-left text-xs sm:text-sm transition shadow-2xs outline-none ${
          isOpen
            ? "border-amber-500 ring-2 ring-amber-500/20"
            : "border-slate-200 hover:border-slate-300 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/20"
        } ${disabled ? "opacity-60 bg-slate-50 cursor-not-allowed" : "cursor-pointer"}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex-1 min-w-0">
          {selectedOptions.length === 0 ? (
            <div className="flex items-center gap-1.5 text-slate-500">
              <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate text-xs font-semibold">{unassignedLabel}</span>
            </div>
          ) : selectedOptions.length === 1 ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <UserCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="truncate font-bold text-slate-900 text-xs sm:text-sm">
                {selectedOptions[0].label}
              </span>
              {selectedOptions[0].badge && (
                <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                  {selectedOptions[0].badge}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 font-bold text-slate-900 text-xs sm:text-sm">
                <Users className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{selectedOptions.length} Employees Selected</span>
              </div>
              <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded-full">
                Multi-Assign
              </span>
            </div>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-amber-600" : ""
          }`}
        />
      </button>

      {/* Selected Pills (Visible below selector when 1 or more are selected) */}
      {selectedOptions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selectedOptions.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 text-amber-950 border border-amber-200/80 px-2 py-0.5 rounded-lg shadow-2xs"
            >
              <span className="truncate max-w-[130px]">{opt.label}</span>
              {opt.badge && (
                <span className="text-[9px] text-amber-700/80 uppercase font-bold">
                  ({opt.badge})
                </span>
              )}
              <button
                type="button"
                onClick={(e) => removeValue(e, opt.value)}
                className="text-amber-700 hover:text-amber-950 hover:bg-amber-100/80 rounded p-0.5 transition"
                title={`Remove ${opt.label}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {selectedOptions.length > 1 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] font-bold text-slate-400 hover:text-rose-600 px-1.5 py-0.5 hover:underline transition self-center"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Box Header */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-full"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Action Toolbar */}
            <div className="mt-1.5 flex items-center justify-between text-[11px] px-1 text-slate-500">
              <span>
                {selectedOptions.length > 0 ? (
                  <strong className="text-amber-700">{selectedOptions.length} selected</strong>
                ) : (
                  <span>Showing {filteredOptions.length} employees</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-amber-600 hover:text-amber-700 font-bold hover:underline"
                >
                  Select All
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-slate-400 hover:text-slate-700 hover:underline"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
            {/* Unassigned Option */}
            <button
              type="button"
              onClick={() => toggleOption("")}
              className={`w-full flex items-center justify-between gap-2 p-2 rounded-xl text-left text-xs transition cursor-pointer ${
                values.length === 0
                  ? "bg-amber-50 text-amber-950 font-bold border border-amber-200/80"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                    values.length === 0
                      ? "bg-amber-500 border-amber-500 text-slate-950"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {values.length === 0 && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <div>
                  <div>{unassignedLabel}</div>
                  <div className="text-[10px] text-slate-400 font-normal">
                    Task will not be assigned to a specific person
                  </div>
                </div>
              </div>
            </button>

            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 italic">
                No matching employees found
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = values.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleOption(opt.value)}
                    className={`w-full flex items-center justify-between gap-2 p-2 rounded-xl text-left text-xs transition cursor-pointer ${
                      isSelected
                        ? "bg-amber-50/90 text-amber-950 font-bold border border-amber-200/60"
                        : "text-slate-800 hover:bg-slate-50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                          isSelected
                            ? "bg-amber-500 border-amber-500 text-slate-950"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">{opt.label}</div>
                        {opt.subLabel && (
                          <div className="text-[10px] text-slate-400 font-normal truncate">
                            {opt.subLabel}
                          </div>
                        )}
                      </div>
                    </div>
                    {opt.badge && (
                      <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                        {opt.badge}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer bar with Done button */}
          <div className="p-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {values.length === 0
                ? "No employees selected"
                : `${values.length} employee${values.length > 1 ? "s" : ""} selected`}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
