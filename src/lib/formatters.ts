/**
 * Formatting utilities for Build Track Pro
 * Integer minor units (paise) <-> Rupees
 */

export function formatCurrency(
  amountInPaise: number | null | undefined,
  currency: string = "INR"
): string {
  if (amountInPaise === null || amountInPaise === undefined) return "₹0.00";
  const rupees = amountInPaise / 100;

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(rupees);
  } catch {
    return `₹${rupees.toFixed(2)}`;
  }
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatQuantity(
  qty: number | null | undefined,
  unitCode: string = ""
): string {
  if (qty === null || qty === undefined) return `0 ${unitCode}`.trim();
  const formatted = Number.isInteger(qty) ? qty.toString() : qty.toFixed(2);
  return `${formatted} ${unitCode}`.trim();
}

export function formatDate(
  dateInput: Date | string | null | undefined,
  timezone: string = "Asia/Kolkata"
): string {
  if (!dateInput) return "—";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: timezone,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return date.toISOString().split("T")[0];
  }
}

export function formatDateTime(
  dateInput: Date | string | null | undefined,
  timezone: string = "Asia/Kolkata"
): string {
  if (!dateInput) return "—";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: timezone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return date.toISOString().replace("T", " ").slice(0, 16);
  }
}

/** Short Indian-style amount for dashboards: ₹950, ₹12.5K, ₹3.4L, ₹1.2Cr. */
export function formatCompactINR(amountInPaise: number | null | undefined): string {
  const rupees = (amountInPaise ?? 0) / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  const trim = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ""));
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

/** Standard human-readable file size formatter (e.g., 512 B, 450 KB, 12.5 MB, 1.8 GB) */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const val = bytes / Math.pow(k, i);
  return `${val >= 10 || i === 0 ? Math.round(val) : val.toFixed(1)} ${sizes[i]}`;
}
