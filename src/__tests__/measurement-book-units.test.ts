import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MEASUREMENT_UNIT_GROUPS,
  MEASUREMENT_TYPE_GROUPS,
  getUnitMetadata,
} from "@/lib/measurement-units";
import { MeasurementBookService } from "@/services/measurement-book-service";

describe("Measurement Book Units & Elements Model Tests", () => {
  describe("1. Segregated Unit Systems & Metadata", () => {
    it("should have distinct separated unit groups (Imperial, Metric, Counts)", () => {
      expect(MEASUREMENT_UNIT_GROUPS).toHaveLength(3);

      const [imperial, metric, site] = MEASUREMENT_UNIT_GROUPS;
      expect(imperial.system).toBe("IMPERIAL");
      expect(imperial.badge).toContain("Feet & Inches");
      expect(metric.system).toBe("METRIC");
      expect(metric.badge).toContain("Meters & Millimeters");
      expect(site.system).toBe("SITE");
    });

    it("should include SQFT, MM, and INCH in their separated categories as requested", () => {
      const imperialCodes = MEASUREMENT_UNIT_GROUPS[0].units.map((u) => u.code);
      const metricCodes = MEASUREMENT_UNIT_GROUPS[1].units.map((u) => u.code);

      // Imperial (FPS)
      expect(imperialCodes).toContain("SQFT");
      expect(imperialCodes).toContain("INCH");
      expect(imperialCodes).toContain("CFT");
      expect(imperialCodes).toContain("RFT");

      // Metric (SI)
      expect(metricCodes).toContain("MM");
      expect(metricCodes).toContain("SQM");
      expect(metricCodes).toContain("CUM");
      expect(metricCodes).toContain("RMT");
    });

    it("should correctly resolve metadata for Square Feet (SQFT)", () => {
      const meta = getUnitMetadata("SQFT");
      expect(meta.code).toBe("SQFT");
      expect(meta.system).toBe("IMPERIAL");
      expect(meta.dimUnit).toBe("ft");
      expect(meta.formula).toBe("AREA");
    });

    it("should correctly resolve metadata for Millimeter (MM)", () => {
      const meta = getUnitMetadata("MM");
      expect(meta.code).toBe("MM");
      expect(meta.system).toBe("METRIC");
      expect(meta.dimUnit).toBe("mm");
      expect(meta.formula).toBe("LENGTH");
    });

    it("should correctly resolve metadata for Inch (INCH)", () => {
      const meta = getUnitMetadata("INCH");
      expect(meta.code).toBe("INCH");
      expect(meta.system).toBe("IMPERIAL");
      expect(meta.dimUnit).toBe("in");
      expect(meta.formula).toBe("LENGTH");
    });

    it("should correctly resolve metadata for Bulk Site units (BRASS)", () => {
      const meta = getUnitMetadata("BRASS");
      expect(meta.code).toBe("BRASS");
      expect(meta.system).toBe("SITE");
      expect(meta.formula).toBe("VOLUME");
    });
  });

  describe("2. Comprehensive Measurement Elements / Types", () => {
    it("should have categorized measurement elements", () => {
      expect(MEASUREMENT_TYPE_GROUPS.length).toBeGreaterThanOrEqual(4);
      const categories = MEASUREMENT_TYPE_GROUPS.map((g) => g.category);
      expect(categories).toContain("Structural Elements");
      expect(categories).toContain("Masonry & Civil Works");
      expect(categories).toContain("Finishing & Architectural");
      expect(categories).toContain("Steel, Formwork & Fabrication");
    });

    it("should include standard civil elements like SLAB, BEAM, COLUMN, PLASTERING, FLOORING", () => {
      const allTypes = MEASUREMENT_TYPE_GROUPS.flatMap((g) => g.types.map((t) => t.code));
      expect(allTypes).toContain("SLAB");
      expect(allTypes).toContain("BEAM");
      expect(allTypes).toContain("COLUMN");
      expect(allTypes).toContain("WALL");
      expect(allTypes).toContain("PLASTERING");
      expect(allTypes).toContain("FLOORING");
      expect(allTypes).toContain("STEEL_REBAR");
      expect(allTypes).toContain("SHUTTERING");
    });
  });

  describe("3. Formula Calculation with Segregated Units", () => {
    it("should correctly compute Area in SQFT (N × L × H) minus deduction", () => {
      // 2 walls of 12 ft length × 10 ft height with 20 sq.ft window deduction
      const { grossQuantity, netQuantity } = MeasurementBookService.calculateQuantities({
        formula: "AREA",
        count: 2,
        length: 12,
        breadth: null,
        depth: 10,
        deduction: 20,
      });

      expect(grossQuantity).toBe(240); // 2 * 12 * 10
      expect(netQuantity).toBe(220); // 240 - 20 SQFT
    });

    it("should correctly compute Volume in CFT / CUM (N × L × B × H)", () => {
      // Beam / footing: 4 units × 10 ft × 1.5 ft × 2 ft
      const { grossQuantity, netQuantity } = MeasurementBookService.calculateQuantities({
        formula: "VOLUME",
        count: 4,
        length: 10,
        breadth: 1.5,
        depth: 2,
        deduction: 0,
      });

      expect(grossQuantity).toBe(120); // 4 * 10 * 1.5 * 2
      expect(netQuantity).toBe(120);
    });

    it("should correctly compute Length in MM / INCH / RFT (N × L)", () => {
      // 5 conduit pipes / skirting tiles of 1200 mm each
      const { grossQuantity, netQuantity } = MeasurementBookService.calculateQuantities({
        formula: "LENGTH",
        count: 5,
        length: 1200,
        breadth: null,
        depth: null,
        deduction: 0,
      });

      expect(grossQuantity).toBe(6000); // 5 * 1200 mm
      expect(netQuantity).toBe(6000);
    });
  });
});
