import { describe, it, expect } from "vitest";

// ── Unit tests for assertion evaluation logic ──────────────────
// Tests the pure-function assertion evaluator independently of the
// database and LLM. These run in CI without any external deps.

// Re-implement the assertion logic here since it's a private function
// in runner.ts. In a future refactor we can extract it.

interface Assertion {
  field: string;
  op: "eq" | "neq" | "contains" | "not_contains" | "regex" | "gt" | "gte" | "lt" | "lte" | "type" | "exists";
  value: unknown;
}

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function evaluateAssertion(
  actual: unknown,
  assertion: Assertion,
): boolean {
  const actualValue = getNestedValue(actual, assertion.field);

  switch (assertion.op) {
    case "eq":
      return JSON.stringify(actualValue) === JSON.stringify(assertion.value);
    case "neq":
      return JSON.stringify(actualValue) !== JSON.stringify(assertion.value);
    case "contains":
      return (
        typeof actualValue === "string" &&
        typeof assertion.value === "string" &&
        actualValue.toLowerCase().includes(assertion.value.toLowerCase())
      );
    case "not_contains":
      return (
        typeof actualValue === "string" &&
        typeof assertion.value === "string" &&
        !actualValue.toLowerCase().includes(assertion.value.toLowerCase())
      );
    case "regex":
      try {
        return (
          typeof actualValue === "string" &&
          new RegExp(assertion.value as string).test(actualValue)
        );
      } catch {
        return false;
      }
    case "gt":
      return typeof actualValue === "number" && actualValue > (assertion.value as number);
    case "gte":
      return typeof actualValue === "number" && actualValue >= (assertion.value as number);
    case "lt":
      return typeof actualValue === "number" && actualValue < (assertion.value as number);
    case "lte":
      return typeof actualValue === "number" && actualValue <= (assertion.value as number);
    case "type":
      return typeof actualValue === assertion.value;
    case "exists":
      return actualValue !== undefined && actualValue !== null;
    default:
      return false;
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe("getNestedValue", () => {
  it("gets top-level keys", () => {
    expect(getNestedValue({ name: "Alice" }, "name")).toBe("Alice");
  });

  it("gets nested keys", () => {
    expect(
      getNestedValue({ output: { tenant_name: "Great Clips" } }, "output.tenant_name"),
    ).toBe("Great Clips");
  });

  it("returns undefined for missing paths", () => {
    expect(getNestedValue({ a: 1 }, "b.c")).toBeUndefined();
  });

  it("handles null in chain", () => {
    expect(getNestedValue({ a: null }, "a.b")).toBeUndefined();
  });

  it("handles deeply nested paths", () => {
    const obj = { a: { b: { c: { d: 42 } } } };
    expect(getNestedValue(obj, "a.b.c.d")).toBe(42);
  });
});

describe("evaluateAssertion", () => {
  const lease = {
    text: "Great Clips Inc. signed a NNN lease at 4821 Maple Ridge Drive for 2,400 SF at $15.00/SF.",
    output: {
      tenant_name: "Great Clips Inc.",
      lease_type: "NNN",
      square_footage: 2400,
      rent_per_sf: 15.0,
    },
  };

  describe("eq", () => {
    it("passes on exact match", () => {
      expect(evaluateAssertion(lease, { field: "output.tenant_name", op: "eq", value: "Great Clips Inc." })).toBe(true);
    });
    it("fails on mismatch", () => {
      expect(evaluateAssertion(lease, { field: "output.tenant_name", op: "eq", value: "AutoZone" })).toBe(false);
    });
    it("matches numbers", () => {
      expect(evaluateAssertion(lease, { field: "output.square_footage", op: "eq", value: 2400 })).toBe(true);
    });
  });

  describe("neq", () => {
    it("passes on mismatch", () => {
      expect(evaluateAssertion(lease, { field: "output.lease_type", op: "neq", value: "Gross" })).toBe(true);
    });
    it("fails on match", () => {
      expect(evaluateAssertion(lease, { field: "output.lease_type", op: "neq", value: "NNN" })).toBe(false);
    });
  });

  describe("contains", () => {
    it("matches case-insensitive substring", () => {
      expect(evaluateAssertion(lease, { field: "text", op: "contains", value: "great clips" })).toBe(true);
    });
    it("fails on missing substring", () => {
      expect(evaluateAssertion(lease, { field: "text", op: "contains", value: "AutoZone" })).toBe(false);
    });
  });

  describe("not_contains", () => {
    it("passes when substring absent", () => {
      expect(evaluateAssertion(lease, { field: "text", op: "not_contains", value: "AutoZone" })).toBe(true);
    });
    it("fails when substring present", () => {
      expect(evaluateAssertion(lease, { field: "text", op: "not_contains", value: "NNN" })).toBe(false);
    });
  });

  describe("regex", () => {
    it("matches valid regex", () => {
      expect(evaluateAssertion(lease, { field: "text", op: "regex", value: "\\d{1,3},\\d{3}\\sSF" })).toBe(true);
    });
    it("fails on no match", () => {
      expect(evaluateAssertion(lease, { field: "text", op: "regex", value: "^AutoZone" })).toBe(false);
    });
    it("handles invalid regex gracefully", () => {
      expect(evaluateAssertion(lease, { field: "text", op: "regex", value: "[invalid" })).toBe(false);
    });
  });

  describe("numeric comparisons", () => {
    it("gt passes", () => {
      expect(evaluateAssertion(lease, { field: "output.square_footage", op: "gt", value: 2000 })).toBe(true);
    });
    it("gt fails on equal", () => {
      expect(evaluateAssertion(lease, { field: "output.square_footage", op: "gt", value: 2400 })).toBe(false);
    });
    it("gte passes on equal", () => {
      expect(evaluateAssertion(lease, { field: "output.square_footage", op: "gte", value: 2400 })).toBe(true);
    });
    it("lt passes", () => {
      expect(evaluateAssertion(lease, { field: "output.rent_per_sf", op: "lt", value: 20 })).toBe(true);
    });
    it("lte passes on equal", () => {
      expect(evaluateAssertion(lease, { field: "output.rent_per_sf", op: "lte", value: 15 })).toBe(true);
    });
    it("fails on non-number field", () => {
      expect(evaluateAssertion(lease, { field: "text", op: "gt", value: 100 })).toBe(false);
    });
  });

  describe("type", () => {
    it("checks string type", () => {
      expect(evaluateAssertion(lease, { field: "text", op: "type", value: "string" })).toBe(true);
    });
    it("checks number type", () => {
      expect(evaluateAssertion(lease, { field: "output.square_footage", op: "type", value: "number" })).toBe(true);
    });
    it("fails on wrong type", () => {
      expect(evaluateAssertion(lease, { field: "text", op: "type", value: "number" })).toBe(false);
    });
  });

  describe("exists", () => {
    it("passes for existing field", () => {
      expect(evaluateAssertion(lease, { field: "output.tenant_name", op: "exists", value: true })).toBe(true);
    });
    it("fails for missing field", () => {
      expect(evaluateAssertion(lease, { field: "output.nonexistent", op: "exists", value: true })).toBe(false);
    });
    it("fails for null field", () => {
      const withNull = { output: { val: null } };
      expect(evaluateAssertion(withNull, { field: "output.val", op: "exists", value: true })).toBe(false);
    });
  });
});
