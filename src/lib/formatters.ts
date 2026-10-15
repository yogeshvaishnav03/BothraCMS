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
