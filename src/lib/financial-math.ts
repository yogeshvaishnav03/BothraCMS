/**
 * Financial and Inventory Precision Mathematics Utilities for Build Track Pro
 *
 * Prevents IEEE 754 floating-point cumulative rounding errors in monetary
 * ledgers, contractor bill lines, payments, allocations, and physical inventory stock.
 */

/**
 * Rounds a paise integer/float to the nearest integer paise.
 * In Build Track Pro, 100 paise = 1 INR.
 */
export function roundPaise(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  return Math.round(amount);
}

/**
 * Rounds a floating currency rupee value to exactly 2 decimal places.
 * Example: 100.10000000000001 -> 100.10
 */
export function roundCurrencyRupees(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Converts floating rupees to exact integer paise.
 * Example: 19.99 rupees -> 1999 paise (prevents 19.99 * 100 = 1998.9999999999998)
 */
export function safeRupeesToPaise(rupees: number): number {
  if (isNaN(rupees) || !isFinite(rupees)) return 0;
  return Math.round((rupees + Number.EPSILON) * 100);
}

/**
 * Converts integer paise to floating rupees with 2 decimal precision.
 */
export function safePaiseToRupees(paise: number): number {
  if (isNaN(paise) || !isFinite(paise)) return 0;
  return roundCurrencyRupees(paise / 100);
}

/**
 * Rounds a physical material quantity to a fixed decimal precision (default: 4 decimals).
 * Example: 0.19999999999999998 -> 0.2
 */
export function roundQuantity(qty: number, decimals: number = 4): number {
  if (isNaN(qty) || !isFinite(qty)) return 0;
  const factor = Math.pow(10, decimals);
  const rounded = Math.round((qty + Number.EPSILON) * factor) / factor;
  return Math.abs(rounded) < 1e-9 ? 0 : rounded;
}

/**
 * Safely adds two physical material quantities, preventing IEEE 754 noise.
 */
export function safeAddQuantity(a: number, b: number, decimals: number = 4): number {
  return roundQuantity(a + b, decimals);
}

/**
 * Safely subtracts two physical material quantities.
 * If the resulting difference is within infinitesimal floating precision (< 1e-9), returns 0.
 */
export function safeSubtractQuantity(a: number, b: number, decimals: number = 4): number {
  const diff = a - b;
  if (Math.abs(diff) < 1e-9) return 0;
  return roundQuantity(diff, decimals);
}

/**
 * Calculates a bill line total in paise given physical quantity and unit rate in paise.
 */
export function calculateLineTotalPaise(quantity: number, unitRatePaise: number): number {
  if (quantity <= 0 || unitRatePaise <= 0) return 0;
  return roundPaise(quantity * unitRatePaise);
}
