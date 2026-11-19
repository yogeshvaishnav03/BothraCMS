"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
  meta?: any;
}

export interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  name?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  searchPlaceholder = "Type to search by name, code, or keyword...",
  disabled = false,
  required = false,
  className = "",
  id,
  name,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value) || null;
  }, [options, value]);

  // Filter options based on search query (case-insensitive multi-word match)
  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;

    const terms = q.split(/\s+/).filter(Boolean);
    return options.filter((opt) => {
      const searchTarget = `${opt.label} ${opt.subLabel || ""} ${opt.badge || ""}`.toLowerCase();
      return terms.every((term) => searchTarget.includes(term));
    });
  }, [options, searchQuery]);

  // Reset highlighted index when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions.length, searchQuery]);

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

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLButtonElement>("[data-select-item]");
    const activeItem = items[highlightedIndex];
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isOpen]);

  // Close on click/tap outside (pointerdown handles iOS touch reliably)
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

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < filteredOptions.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const targetOption = filteredOptions[highlightedIndex];
      if (targetOption) {
        onChange(targetOption.value);
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      onKeyDown={handleKeyDown}
      id={id ? `${id}-container` : undefined}
    >
      {/* Hidden input for HTML form requirement validation */}
      {name && <input type="hidden" name={name} value={value} required={required} />}

      {/* Main Trigger Button */}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-slate-800 border rounded-xl text-left text-xs sm:text-sm transition shadow-2xs outline-none ${
          isOpen
            ? "border-amber-500 ring-2 ring-amber-500/20"
            : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/20"
        } ${disabled ? "opacity-60 bg-slate-50 dark:bg-slate-900 cursor-not-allowed" : "cursor-pointer"}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex-1 min-w-0">
          {selectedOption ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                {selectedOption.label}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 text-xs sm:text-sm">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-amber-600" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Box Header */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* Filter Count Counter */}
            <div className="flex items-center justify-between px-1 pt-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              <span>
                {filteredOptions.length === options.length
                  ? `Showing all ${options.length} options`
                  : `Showing ${filteredOptions.length} of ${options.length} matches`}
              </span>
              {searchQuery && filteredOptions.length > 0 && (
                <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/50 px-1.5 py-0.2 rounded font-semibold">
                  Filtered
                </span>
              )}
            </div>
          </div>

          {/* Options List */}
          <div
            ref={listRef}
            className="max-h-[40dvh] sm:max-h-72 overflow-y-auto p-1.5 space-y-0.5 divide-y divide-slate-50 dark:divide-slate-700/50"
            role="listbox"
          >
            {filteredOptions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <Search className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto mb-1.5" />
                <div className="font-semibold text-slate-700 dark:text-slate-300">No results found</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 max-w-xs mx-auto">
                  No options matched &ldquo;<span className="font-semibold text-slate-600 dark:text-slate-300">{searchQuery}</span>&rdquo;. Try searching with another keyword.
                </div>
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    key={opt.value}
                    type="button"
                    data-select-item
                    onClick={() => handleSelect(opt.value)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-2.5 transition ${
                      isSelected
                        ? "bg-amber-500/10 dark:bg-amber-500/20 text-amber-950 dark:text-amber-100 font-semibold border border-amber-300/50 dark:border-amber-600/50"
                        : isHighlighted
                        ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        : "hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-800 dark:text-slate-200"
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="line-clamp-2 leading-snug">{opt.label}</span>
                        {opt.badge && (
                          <span className="shrink-0 font-mono text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 px-1.5 py-0.5 rounded">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.subLabel && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal mt-0.5 truncate">
                          {opt.subLabel}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-amber-600 shrink-0 stroke-[2.5]" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
