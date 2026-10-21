import React from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-300",
  success: "bg-emerald-50 text-emerald-800 border-emerald-300",
  warning: "bg-amber-50 text-amber-800 border-amber-300",
  danger: "bg-rose-50 text-rose-800 border-rose-300",
  info: "bg-sky-50 text-sky-800 border-sky-300",
};

/** Maps common record statuses to a badge tone. */
export function statusTone(status: string | null | undefined): BadgeTone {
  switch ((status || "").toUpperCase()) {
    case "POSTED":
    case "APPROVED":
    case "ACTIVE":
    case "COMPLETED":
    case "VERIFIED":
    case "PRESENT":
    case "DELIVERED":
      return "success";
    case "PENDING":
    case "PENDING_APPROVAL":
    case "SUBMITTED":
    case "IN_PROGRESS":
    case "HALF_DAY":
    case "DRAFT":
      return "warning";
    case "REJECTED":
    case "REVERSED":
    case "BLOCKED":
    case "SUSPENDED":
    case "ABSENT":
    case "CANCELLED":
      return "danger";
    default:
      return "neutral";
  }
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold whitespace-nowrap",
        TONES[tone],
        className
      )}
      {...rest}
    />
  );
}
