import { describe, it, expect } from "vitest";
import { scanFairHousing } from "./fair-housing-scanner";

function expectFlagged(text: string, opts: { category?: string; severity?: string } = {}) {
  const r = scanFairHousing(text);
  expect(r.flagged, `expected flagged=true for: ${text}`).toBe(true);
  if (opts.category) {
    expect(
      r.findings.some((f) => f.category === opts.category),
      `expected category=${opts.category} for: ${text}`,
    ).toBe(true);
  }
  if (opts.severity) {
    expect(
      r.findings.some((f) => f.severity === opts.severity),
      `expected severity=${opts.severity} for: ${text}`,
    ).toBe(true);
  }
}

function expectClean(text: string) {
  const r = scanFairHousing(text);
  expect(r.flagged, `expected flagged=false for: ${text}`).toBe(false);
}

describe("fair housing scanner", () => {
  describe("familial status", () => {
    it("flags 'perfect for families with kids'", () => {
      expectFlagged("This home is perfect for families with kids.", { category: "familial_status", severity: "high" });
    });
    it("flags 'ideal for young families'", () => {
      expectFlagged("Ideal for young families looking to settle down.", { category: "familial_status" });
    });
    it("flags 'no kids allowed'", () => {
      expectFlagged("Sorry, no kids allowed in this rental.", { category: "familial_status", severity: "high" });
    });
    it("flags 'adults-only'", () => {
      expectFlagged("Adults-only HOA community.", { category: "familial_status" });
    });
    it("flags 'family-oriented neighborhood'", () => {
      expectFlagged("A truly family-oriented neighborhood.", { category: "familial_status" });
    });
  });

  describe("general / class signaling", () => {
    it("flags 'safe neighborhood with great schools'", () => {
      expectFlagged("Safe neighborhood with great schools.", { category: "general", severity: "high" });
    });
    it("flags 'desirable area'", () => {
      expectFlagged("Located in a desirable area.", { category: "general" });
    });
    it("flags 'exclusive community'", () => {
      expectFlagged("This home is in an exclusive community.", { category: "general" });
    });
  });

  describe("religion", () => {
    it("flags reference to church", () => {
      expectFlagged("Walking distance to St. Mary's Cathedral.", { category: "religion" });
    });
  });

  describe("disability", () => {
    it("flags 'not suitable for the elderly'", () => {
      expectFlagged("Not suitable for the elderly — three flights of stairs.", { category: "disability" });
    });
    it("flags 'must be able-bodied'", () => {
      expectFlagged("Buyer must be able-bodied to maintain the property.", { category: "disability" });
    });
  });

  describe("source of income", () => {
    it("flags 'no section 8'", () => {
      expectFlagged("No Section 8 vouchers accepted.", { category: "source_of_income" });
    });
    it("flags 'no vouchers'", () => {
      expectFlagged("Sorry, no vouchers.", { category: "source_of_income" });
    });
  });

  describe("clean property descriptions", () => {
    it("passes factual property description", () => {
      expectClean("412 Beech is a 4-bedroom, 2.5-bath home with a finished basement and fenced backyard.");
    });
    it("passes neutral location description", () => {
      expectClean("Located on a quiet residential street within walking distance of two public parks.");
    });
    it("passes renovation details", () => {
      expectClean("The kitchen was renovated in 2022 with quartz countertops and stainless steel appliances.");
    });
    it("passes parking / HOA info", () => {
      expectClean("Off-street parking for two vehicles. HOA dues $250/mo.");
    });
    it("passes HOPA-qualified community", () => {
      expectClean("55+ age-qualified community per Housing for Older Persons Act. Two bedrooms, one bath.");
    });
  });

  describe("multi-finding rollup", () => {
    it("rolls up worst severity to high", () => {
      const r = scanFairHousing("This safe neighborhood is perfect for families. No Section 8 accepted.");
      expect(r.flagged).toBe(true);
      expect(r.worst).toBe("high");
      expect(r.findings.length).toBeGreaterThanOrEqual(3);
    });

    it("sorts findings by document order", () => {
      const r = scanFairHousing("Safe neighborhood. Ideal for young families.");
      for (let i = 1; i < r.findings.length; i++) {
        expect(r.findings[i].index).toBeGreaterThanOrEqual(r.findings[i - 1].index);
      }
    });
  });
});
