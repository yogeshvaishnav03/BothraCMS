"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Modal({
  title,
  icon: Icon,
  onClose,
  onSubmit,
  error,
  submitLabel,
  saving,
  wide,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  onClose: () => void;
  onSubmit?: () => void;
  error?: string | null;
  submitLabel?: string;
  saving?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn("flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl animate-scale-in sm:rounded-2xl", wide ? "max-w-3xl" : "max-w-lg")}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
            {Icon && <Icon className="h-5 w-5 text-amber-500" />} {title}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <Alert tone="error">{error}</Alert>}
          {children}
        </div>
        {onSubmit && (
          <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-brand px-4 py-2 text-sm font-bold text-slate-950 shadow-sm disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel || "Save"}
            </button>
          </footer>
        )}
      </form>
    </div>
  );
}

export const inputCls = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100";

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="text-xs font-bold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

/** A number tile for the top of a page. */
export function StatTile({ value, label, tone = "slate", hint }: { value: React.ReactNode; label: string; tone?: "slate" | "amber" | "rose" | "emerald" | "blue"; hint?: React.ReactNode }) {
  const color = { slate: "text-slate-900", amber: "text-amber-600", rose: "text-rose-600", emerald: "text-emerald-600", blue: "text-blue-600" }[tone];
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <div className={cn("font-display text-2xl font-extrabold tabular-nums", color)}>{value}</div>
      <div className="mt-0.5 text-xs font-medium text-slate-500">{label}</div>
      {hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

/** Pill-style tabs. */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition",
            value === t.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={cn("ml-1.5 tabular-nums", value === t.id ? "text-amber-300" : "text-slate-400")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
