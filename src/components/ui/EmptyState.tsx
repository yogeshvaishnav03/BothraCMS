import React from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Optional call-to-action buttons. */
  children?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon: Icon = Inbox, children, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-2 px-4 py-12 rounded-2xl border border-dashed border-slate-300 bg-gradient-to-b from-white to-slate-50/60",
        className
      )}
    >
      <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 animate-float">
        <Icon className="w-5 h-5" aria-hidden />
      </span>
      <p className="text-sm font-bold text-slate-800">{title}</p>
      {description && <p className="text-xs text-slate-500 max-w-md">{description}</p>}
      {children && <div className="flex flex-wrap items-center justify-center gap-2 mt-2">{children}</div>}
    </div>
  );
}
