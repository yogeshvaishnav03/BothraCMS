import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  /** Action buttons shown on the right (stacked below the title on mobile). */
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, icon: Icon, children, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
          {Icon && <Icon className="w-6 h-6 text-amber-500 shrink-0" aria-hidden />}
          <span className="min-w-0 break-words">{title}</span>
        </h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
