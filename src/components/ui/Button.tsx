import React from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "dark" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm",
  secondary: "bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-xs",
  dark: "bg-slate-900 hover:bg-slate-800 text-white shadow-sm",
  ghost: "bg-transparent hover:bg-slate-100 text-slate-700",
  danger: "bg-rose-600 hover:bg-rose-500 text-white shadow-sm",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-lg",
  md: "px-3.5 py-2 text-xs gap-1.5 rounded-lg",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, icon, className, children, disabled, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center font-bold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});
