import { describe, it, expect } from "vitest";
import {
  matchContractorTradeCategory,
  validateWorkerPhone,
  VALID_WORKER_TYPES,
} from "../lib/contractor-trade-mapping";

describe("Dynamic Contractor Selection and Worker Auto-Population", () => {
  describe("Trade Category Auto-Matching", () => {
    it("should match mason related terms to MASON", () => {
      expect(matchContractorTradeCategory("RCC Masonry works")).toBe("MASON");
      expect(matchContractorTradeCategory("Civil brick work & plaster")).toBe("MASON");
      expect(matchContractorTradeCategory("Tile laying and marble contractor")).toBe("MASON");
      expect(matchContractorTradeCategory("Concrete foundation works")).toBe("MASON");
    });

    it("should match carpentry and woodwork to CARPENTER", () => {
      expect(matchContractorTradeCategory("Carpentry & shuttering")).toBe("CARPENTER");
      expect(matchContractorTradeCategory("Woodwork contractor")).toBe("CARPENTER");
      expect(matchContractorTradeCategory("Formwork specialist")).toBe("CARPENTER");
    });

    it("should match electrical and cabling to ELECTRICIAN", () => {
      expect(matchContractorTradeCategory("Electrical contractor")).toBe("ELECTRICIAN");
      expect(matchContractorTradeCategory("Wiring and panel board installation")).toBe("ELECTRICIAN");
      expect(matchContractorTradeCategory("High voltage cabling")).toBe("ELECTRICIAN");
    });

    it("should match plumbing and sanitary to PLUMBER", () => {
      expect(matchContractorTradeCategory("Plumbing contractor")).toBe("PLUMBER");
      expect(matchContractorTradeCategory("Sanitary and pipe fitting")).toBe("PLUMBER");
      expect(matchContractorTradeCategory("Water supply drainage works")).toBe("PLUMBER");
    });

    it("should match general labour and helpers to HELPER", () => {
      expect(matchContractorTradeCategory("General labour supply")).toBe("HELPER");
      expect(matchContractorTradeCategory("Helper and beldar agency")).toBe("HELPER");
      expect(matchContractorTradeCategory("Earthwork excavation workers")).toBe("HELPER");
      expect(matchContractorTradeCategory("Cleaning and shifting")).toBe("HELPER");
    });

    it("should match foreman and supervisor to FOREMAN", () => {
      expect(matchContractorTradeCategory("Site Supervisor")).toBe("FOREMAN");
      expect(matchContractorTradeCategory("Mukadam / Labor Head")).toBe("FOREMAN");
      expect(matchContractorTradeCategory("Head Foreman")).toBe("FOREMAN");
    });

    it("should match engineers to SITE_ENGINEER", () => {
      expect(matchContractorTradeCategory("Site Engineer")).toBe("SITE_ENGINEER");
      expect(matchContractorTradeCategory("Civil Engineer Consultant")).toBe("SITE_ENGINEER");
      expect(matchContractorTradeCategory("Junior Site Engineer")).toBe("SITE_ENGINEER");
    });

    it("should fallback gracefully to MASON for unknown or empty trades", () => {
      expect(matchContractorTradeCategory("")).toBe("MASON");
      expect(matchContractorTradeCategory(null)).toBe("MASON");
      expect(matchContractorTradeCategory(undefined)).toBe("MASON");
      expect(matchContractorTradeCategory("General Construction Vendor")).toBe("MASON");
    });

    it("all mapped results must be in VALID_WORKER_TYPES enum", () => {
      const samples = [
        "RCC Masonry",
        "Woodwork",
        "Electricals",
        "Plumbing",
        "Helpers",
        "Supervision",
        "Civil Engineer",
        "Random Service",
      ];
      for (const sample of samples) {
        const result = matchContractorTradeCategory(sample);
        expect(VALID_WORKER_TYPES).toContain(result);
      }
    });
  });

  describe("Phone Number Validation", () => {
    it("should accept valid 10-digit Indian mobile numbers", () => {
      expect(validateWorkerPhone("9876543210")).toBe(true);
      expect(validateWorkerPhone("7000000001")).toBe(true);
    });

    it("should accept valid formatted phone numbers with country codes and spaces", () => {
      expect(validateWorkerPhone("+91 98765 43210")).toBe(true);
      expect(validateWorkerPhone("+91-9876543210")).toBe(true);
      expect(validateWorkerPhone("(+91) 98765 43210")).toBe(true);
      expect(validateWorkerPhone("011-23456789")).toBe(true);
    });

    it("should reject invalid phone strings with fewer than 10 digits or invalid characters", () => {
      expect(validateWorkerPhone("12345")).toBe(false);
      expect(validateWorkerPhone("not-a-phone")).toBe(false);
      expect(validateWorkerPhone("98765-ABCDE")).toBe(false);
      expect(validateWorkerPhone("1234567890123456789")).toBe(false); // > 15 digits
    });
  });

  describe("Worker ID Sequential Generation Format", () => {
    it("should start sequentially from WRK-8015 when existing codes are lower or absent", () => {
      const calculateNextCode = (existingCodes: string[]) => {
        let maxNum = 8014;
        for (const code of existingCodes) {
          const match = (code || "").trim().toUpperCase().match(/^WRK-(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        }
        let nextNum = maxNum + 1;
        let candidate = `WRK-${nextNum}`;
        const existingSet = new Set(existingCodes.map((c) => c.toUpperCase()));
        while (existingSet.has(candidate)) {
          nextNum++;
          candidate = `WRK-${nextNum}`;
        }
        return candidate;
      };

      // Empty database should start at WRK-8015
      expect(calculateNextCode([])).toBe("WRK-8015");

      // Lower legacy codes (e.g. WRK-1001, WRK-1004) should still start at WRK-8015
      expect(calculateNextCode(["WRK-1001", "WRK-1002", "WRK-1003", "WRK-1004"])).toBe("WRK-8015");

      // Existing WRK-8015 increments to WRK-8016
      expect(calculateNextCode(["WRK-8015"])).toBe("WRK-8016");

      // Sequential progression WRK-8015, WRK-8016, WRK-8017
      expect(calculateNextCode(["WRK-8015", "WRK-8016"])).toBe("WRK-8017");
      expect(calculateNextCode(["WRK-8015", "WRK-8016", "WRK-8017"])).toBe("WRK-8018");
    });
  });

  describe("Contractor to Worker Form Field Population", () => {
    it("should properly transform contractor record into worker form fields", () => {
      const mockContractorParty = {
        id: "party-uuid-101",
        name: "Ramesh RCC & Masonry Works",
        partyType: "CONTRACTOR",
        phone: "+91 98765 00001",
        whatsappNumber: "+91 98765 00001",
        category: "RCC Concrete and Masonry",
        city: "Jaipur",
        dailyWageRate: 90000, // 900 Rs in paise
        maleHelperWageRate: 60000, // 600 Rs in paise
        femaleHelperWageRate: 50000, // 500 Rs in paise
      };

      const populatedName = mockContractorParty.name;
      const populatedPhone = mockContractorParty.phone || mockContractorParty.whatsappNumber || "";
      const mappedTrade = matchContractorTradeCategory(mockContractorParty.category || mockContractorParty.name);
      const skilledRateRupees = mockContractorParty.dailyWageRate / 100;
      const maleRateRupees = mockContractorParty.maleHelperWageRate / 100;
      const femaleRateRupees = mockContractorParty.femaleHelperWageRate / 100;

      expect(populatedName).toBe("Ramesh RCC & Masonry Works");
      expect(populatedPhone).toBe("+91 98765 00001");
      expect(mappedTrade).toBe("MASON");
      expect(skilledRateRupees).toBe(900);
      expect(maleRateRupees).toBe(600);
      expect(femaleRateRupees).toBe(500);
    });
  });
});
