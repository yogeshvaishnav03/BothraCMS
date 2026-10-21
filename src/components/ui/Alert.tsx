import React from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type AlertTone = "error" | "success" | "warning" | "info";

const TONES: Record<AlertTone, { box: string; Icon: typeof Info }> = {
  error: { box: "bg-rose-50 border-rose-300 text-rose-900", Icon: XCircle },
  success: { box: "bg-emerald-50 border-emerald-300 text-emerald-900", Icon: CheckCircle2 },
  warning: { box: "bg-amber-50 border-amber-300 text-amber-900", Icon: AlertTriangle },
  info: { box: "bg-sky-50 border-sky-300 text-sky-900", Icon: Info },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function Alert({ tone = "info", title, children, onDismiss, className }: AlertProps) {
  const { box, Icon } = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 p-3 rounded-xl border text-xs font-medium", box, className)}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0 flex-1 break-words">
        {title && <p className="font-bold mb-0.5">{title}</p>}
        {children}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-0.5 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
