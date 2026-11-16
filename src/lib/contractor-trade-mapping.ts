export type WorkerType =
  | "MASON"
  | "CARPENTER"
  | "ELECTRICIAN"
  | "PLUMBER"
  | "HELPER"
  | "FOREMAN"
  | "SITE_ENGINEER";

export const VALID_WORKER_TYPES: readonly WorkerType[] = [
  "MASON",
  "CARPENTER",
  "ELECTRICIAN",
  "PLUMBER",
  "HELPER",
  "FOREMAN",
  "SITE_ENGINEER",
] as const;

/**
 * Maps a contractor's category or trade description into one of the 7 standard
 * workforce member trade categories required by the system.
 */
export function matchContractorTradeCategory(category?: string | null): WorkerType {
  if (!category) return "MASON";
  const c = category.trim().toUpperCase();

  // 1. Direct match with valid enum values
  if (VALID_WORKER_TYPES.includes(c as WorkerType)) {
    return c as WorkerType;
  }

  // 2. High-priority supervisory and technical roles first
  if (
    c.includes("ENGINEER") ||
    c.includes("TECH") ||
    c.includes("SURVEY") ||
    c.includes("QUALITY")
  ) {
    return "SITE_ENGINEER";
  }

  if (
    c.includes("FOREMAN") ||
    c.includes("MISTRY") ||
    c.includes("MESTRI") ||
    c.includes("MUKADAM") ||
    c.includes("SUPERVISOR") ||
    c.includes("LEAD") ||
    c.includes("HEAD")
  ) {
    return "FOREMAN";
  }

  // 3. Keyword-based trade mapping for standard construction trades
  if (
    c.includes("CARPENT") ||
    c.includes("SHUTTER") ||
    c.includes("WOOD") ||
    c.includes("FORMWORK") ||
    c.includes("PLYWOOD")
  ) {
    return "CARPENTER";
  }

  if (
    c.includes("ELECTR") ||
    c.includes("WIRE") ||
    c.includes("WIRING") ||
    c.includes("LIGHT") ||
    c.includes("CABLE") ||
    c.includes("CABLING") ||
    c.includes("PANEL") ||
    c.includes("POWER")
  ) {
    return "ELECTRICIAN";
  }

  if (
    c.includes("PLUMB") ||
    c.includes("PIPE") ||
    c.includes("SANITARY") ||
    c.includes("DRAIN") ||
    c.includes("PUMP")
  ) {
    return "PLUMBER";
  }

  if (
    c.includes("MASON") ||
    c.includes("RCC") ||
    c.includes("CONCRETE") ||
    c.includes("BRICK") ||
    c.includes("PLASTER") ||
    c.includes("TILE") ||
    c.includes("FLOOR") ||
    c.includes("STONE") ||
    c.includes("CIVIL")
  ) {
    return "MASON";
  }

  if (
    c.includes("LABOUR") ||
    c.includes("LABOR") ||
    c.includes("HELP") ||
    c.includes("BELDAR") ||
    c.includes("SUPPLY") ||
    c.includes("UNSKILLED") ||
    c.includes("EXCAVAT") ||
    c.includes("CLEAN") ||
    c.includes("SHIFT")
  ) {
    return "HELPER";
  }

  return "MASON";
}

/**
 * Validates phone numbers: strips non-digits and checks for 10-15 digit phone format.
 */
export function validateWorkerPhone(phone?: string | null): boolean {
  if (!phone || !phone.trim()) return true; // Optional field
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}
