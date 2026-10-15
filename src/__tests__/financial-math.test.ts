import { describe, it, expect } from "vitest";
import {
  roundPaise,
  roundCurrencyRupees,
  safeRupeesToPaise,
  safePaiseToRupees,
  roundQuantity,
  safeAddQuantity,
  safeSubtractQuantity,
  calculateLineTotalPaise,
} from "../lib/financial-math";

describe("Financial and Inventory Precision Mathematics", () => {
  describe("Rupee and Paise Conversions", () => {
    it("should accurately convert rupees with floating precision issues to exact paise", () => {
      // Classic JS floating error: 19.99 * 100 = 1998.9999999999998
      expect(19.99 * 100).toBe(1998.9999999999998);
      expect(safeRupeesToPaise(19.99)).toBe(1999);
      expect(safeRupeesToPaise(0.07)).toBe(7);
      expect(safeRupeesToPaise(149.95)).toBe(14995);
    });

    it("should accurately convert paise to rupees with 2-decimal precision", () => {
      expect(safePaiseToRupees(1999)).toBe(19.99);
      expect(safePaiseToRupees(7)).toBe(0.07);
      expect(safePaiseToRupees(14995)).toBe(149.95);
      expect(safePaiseToRupees(0)).toBe(0);
    });

    it("should round paise to the nearest integer value", () => {
      expect(roundPaise(1234.4)).toBe(1234);
      expect(roundPaise(1234.6)).toBe(1235);
      expect(roundPaise(1234.00000000001)).toBe(1234);
    });

    it("should round currency rupees to 2 decimal places", () => {
      expect(roundCurrencyRupees(100.10000000000001)).toBe(100.1);
      expect(roundCurrencyRupees(100.105)).toBe(100.11);
      expect(roundCurrencyRupees(100.104)).toBe(100.1);
    });

    it("should calculate bill line total paise without floating rounding drift", () => {
      // 3.333 MT at 4500000 paise (45000 Rs) per MT
      const total = calculateLineTotalPaise(3.333, 4500000);
      expect(total).toBe(14998500);
      expect(Number.isInteger(total)).toBe(true);
    });
  });

  describe("Physical Inventory Quantities", () => {
    it("should eliminate IEEE 754 floating point drift during subtraction", () => {
      // Classic JS floating error: 0.3 - 0.1 = 0.19999999999999998
      expect(0.3 - 0.1).not.toBe(0.2);
      expect(safeSubtractQuantity(0.3, 0.1)).toBe(0.2);
    });

    it("should clamp infinitesimal differences to exactly zero", () => {
      // 0.3 - 0.1 - 0.2 = -5.551115123125783e-17 in native JS
      const nativeDiff = 0.3 - 0.1 - 0.2;
      expect(nativeDiff).not.toBe(0);
      expect(safeSubtractQuantity(0.2, 0.2)).toBe(0);
      expect(safeSubtractQuantity(0.3 - 0.1, 0.2)).toBe(0);
    });

    it("should eliminate IEEE 754 floating point drift during addition", () => {
      // 0.1 + 0.2 = 0.30000000000000004 in native JS
      expect(0.1 + 0.2).not.toBe(0.3);
      expect(safeAddQuantity(0.1, 0.2)).toBe(0.3);
    });

    it("should round quantities to designated decimal places", () => {
      expect(roundQuantity(12.3456789, 4)).toBe(12.3457);
      expect(roundQuantity(12.3456123, 4)).toBe(12.3456);
      expect(roundQuantity(10.00000001, 4)).toBe(10);
    });
  });
});
