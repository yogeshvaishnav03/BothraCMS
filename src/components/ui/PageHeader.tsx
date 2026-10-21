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
        "flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl sm:text-[26px] font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          {Icon && (
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-brand text-white shadow-glow shrink-0">
              <Icon className="w-5 h-5" aria-hidden />
            </span>
          )}
          <span className="min-w-0 break-words">{title}</span>
        </h1>
        {subtitle && <p className={cn("text-sm text-slate-500 mt-1", Icon && "sm:pl-[52px]")}>{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
