import React from "react";
import { cn } from "@/lib/cn";

export interface LoadingStateProps {
  label?: React.ReactNode;
  className?: string;
}

export function LoadingState({ label = "Loading…", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-3 py-12 text-slate-500", className)}
    >
      <span className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" aria-hidden />
      <span className="text-xs font-semibold">{label}</span>
    </div>
  );
}
