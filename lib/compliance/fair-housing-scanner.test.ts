// lib/compliance/fair-housing-scanner.test.ts
//
// Smoke tests for the deterministic scanner. Verifies the pattern
// catalog catches the canonical risk phrases and lets neutral
// property-fact descriptions through.
//
// Run: npx tsx lib/compliance/fair-housing-scanner.test.ts

import assert from "node:assert/strict";
import { scanFairHousing } from "./fair-housing-scanner";

function expectFlagged(text: string, opts: { category?: string; severity?: string } = {}) {
  const r = scanFairHousing(text);
  assert.equal(r.flagged, true, `expected flagged=true for: ${text}`);
  if (opts.category) {
    assert.ok(
      r.findings.some((f) => f.category === opts.category),
      `expected category=${opts.category} in findings for: ${text}`,
    );
  }
  if (opts.severity) {
    assert.ok(
      r.findings.some((f) => f.severity === opts.severity),
      `expected severity=${opts.severity} in findings for: ${text}`,
    );
  }
}

function expectClean(text: string) {
  const r = scanFairHousing(text);
  assert.equal(r.flagged, false, `expected flagged=false for: ${text}\n  findings: ${JSON.stringify(r.findings, null, 2)}`);
}

// Familial status
expectFlagged("This home is perfect for families with kids.", { category: "familial_status", severity: "high" });
expectFlagged("Ideal for young families looking to settle down.", { category: "familial_status" });
expectFlagged("Sorry, no kids allowed in this rental.", { category: "familial_status", severity: "high" });
expectFlagged("Adults-only HOA community.", { category: "familial_status" });
expectFlagged("A truly family-oriented neighborhood.", { category: "familial_status" });

// Class / general signaling
expectFlagged("Safe neighborhood with great schools.", { category: "general", severity: "high" });
expectFlagged("Located in a desirable area.", { category: "general" });
expectFlagged("This home is in an exclusive community.", { category: "general" });

// Religion
expectFlagged("Walking distance to St. Mary's Cathedral.", { category: "religion" });

// Disability
expectFlagged("Not suitable for the elderly — three flights of stairs.", { category: "disability" });
expectFlagged("Buyer must be able-bodied to maintain the property.", { category: "disability" });

// Source of income
expectFlagged("No Section 8 vouchers accepted.", { category: "source_of_income" });
expectFlagged("Sorry, no vouchers.", { category: "source_of_income" });

// Clean copy that should NOT flag
expectClean(
  "412 Beech is a 4-bedroom, 2.5-bath home with a finished basement and fenced backyard.",
);
expectClean(
  "Located on a quiet residential street within walking distance of two public parks.",
);
expectClean(
  "The kitchen was renovated in 2022 with quartz countertops and stainless steel appliances.",
);
expectClean("Off-street parking for two vehicles. HOA dues $250/mo.");
expectClean(
  "55+ age-qualified community per Housing for Older Persons Act. Two bedrooms, one bath.",
);

// Multiple findings — verify worst severity rolls up
{
  const r = scanFairHousing(
    "This safe neighborhood is perfect for families. No Section 8 accepted.",
  );
  assert.equal(r.flagged, true);
  assert.equal(r.worst, "high");
  assert.ok(r.findings.length >= 3, `expected ≥3 findings, got ${r.findings.length}`);
}

// Findings sorted by document order
{
  const r = scanFairHousing(
    "Safe neighborhood. Ideal for young families.",
  );
  for (let i = 1; i < r.findings.length; i++) {
    assert.ok(
      r.findings[i].index >= r.findings[i - 1].index,
      "findings must be sorted by index",
    );
  }
}

console.log("fair-housing-scanner: all tests passed");
