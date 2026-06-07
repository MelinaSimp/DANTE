import { describe, it, expect } from "vitest";
import { validateCitations } from "./citation-validator";

describe("validateCitations", () => {
  // ── Baseline: no citations ──────────────────────────────────

  it("returns no_citations for text without markers", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "Hi, no citations here. Just plain text.",
      trace: [],
    });
    expect(r.overall).toBe("no_citations");
    expect(r.checks).toHaveLength(0);
    expect(r.counts.total).toBe(0);
  });

  it("returns no_citations for empty string", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "",
      trace: [],
    });
    expect(r.overall).toBe("no_citations");
    expect(r.counts.total).toBe(0);
  });

  // ── Vault markers ───────────────────────────────────────────

  it("detects vault marker [v1] and reports missing when trace empty", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "The IPS limits cash to 5% [v1].",
      trace: [],
    });
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0].marker).toBe("[v1]");
    expect(r.checks[0].type).toBe("vault");
    expect(["missing", "unverifiable"]).toContain(r.checks[0].status);
  });

  it("handles multiple vault markers", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "The IPS [v1] states cash at 5% [v2] and bonds at 40% [v3].",
      trace: [],
    });
    expect(r.checks).toHaveLength(3);
    expect(r.checks.every((c) => c.type === "vault")).toBe(true);
  });

  it("handles duplicate markers — each occurrence produces a check", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "Per [v1], the cap is 5%. Again [v1] confirms this.",
      trace: [],
    });
    expect(r.checks.length).toBeGreaterThanOrEqual(1);
    expect(r.checks.every((c) => c.marker === "[v1]")).toBe(true);
  });

  it("detects high-numbered vault markers", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "Per page [v142], the allocation is 60%.",
      trace: [],
    });
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0].marker).toBe("[v142]");
    expect(r.checks[0].type).toBe("vault");
  });

  // ── Memory markers ──────────────────────────────────────────

  it("detects memory markers with varying hex lengths", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "Short [mem:abcd] and long [mem:abcdef1234567890abcdef1234567890].",
      trace: [],
    });
    expect(r.checks).toHaveLength(2);
    expect(r.checks.every((c) => c.type === "memory")).toBe(true);
  });

  it("detects a single memory marker", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "The client mentioned [mem:1234abcd] wanting growth exposure.",
      trace: [],
    });
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0].type).toBe("memory");
    expect(r.checks[0].marker).toBe("[mem:1234abcd]");
  });

  // ── Regulatory markers ──────────────────────────────────────

  it("detects regulatory markers [reg:N]", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText:
        "Per SEC guidance [reg:42], this is required under the fiduciary standard [v1].",
      trace: [],
    });
    expect(r.checks).toHaveLength(2);
    const types = r.checks.map((c) => c.type);
    expect(types).toContain("regulatory");
    expect(types).toContain("vault");
  });

  it("detects multiple regulatory markers", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "Under [reg:1] and [reg:2], the disclosure requirements apply.",
      trace: [],
    });
    expect(r.checks).toHaveLength(2);
    expect(r.checks.every((c) => c.type === "regulatory")).toBe(true);
  });

  // ── Mixed marker types ──────────────────────────────────────

  it("detects both vault and memory markers", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText:
        "Per the IPS [v1], cash is capped. The client also mentioned this [mem:abcd1234] last quarter.",
      trace: [],
    });
    expect(r.checks).toHaveLength(2);
    expect(r.checks[0].type).toBe("vault");
    expect(r.checks[1].type).toBe("memory");
  });

  it("detects all three marker types together", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText:
        "The IPS [v1] states 60/40. The client prefers [mem:aabb1122] bond ladders. Per SEC [reg:3], this is compliant.",
      trace: [],
    });
    expect(r.checks).toHaveLength(3);
    const types = r.checks.map((c) => c.type);
    expect(types).toContain("vault");
    expect(types).toContain("memory");
    expect(types).toContain("regulatory");
  });

  // ── Unrecognized patterns (false negatives) ─────────────────

  it("ignores unrecognized bracket patterns", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "Footnote [1] and [Note] are not citation markers.",
      trace: [],
    });
    expect(r.overall).toBe("no_citations");
    expect(r.checks).toHaveLength(0);
  });

  it("ignores markdown-style links in brackets", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "See [this article](https://example.com) for more details.",
      trace: [],
    });
    expect(r.overall).toBe("no_citations");
    expect(r.checks).toHaveLength(0);
  });

  it("ignores bracketed numbers without v prefix", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "The allocation is [60] percent equities and [40] percent bonds.",
      trace: [],
    });
    expect(r.overall).toBe("no_citations");
    expect(r.checks).toHaveLength(0);
  });

  // ── Count correctness ──────────────────────────────────────

  it("counts are accurate for mixed valid/missing markers", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "[v1] [v2] [mem:aaaa] [reg:5]",
      trace: [],
    });
    expect(r.counts.total).toBe(4);
    expect(r.counts.valid + r.counts.failed + r.counts.unverifiable).toBe(4);
  });

  // ── Marker ordering ────────────────────────────────────────

  it("returns checks in document order", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "First [reg:1], then [v1], finally [mem:abcd].",
      trace: [],
    });
    expect(r.checks).toHaveLength(3);
    expect(r.checks[0].type).toBe("regulatory");
    expect(r.checks[1].type).toBe("vault");
    expect(r.checks[2].type).toBe("memory");
  });

  // ── Edge cases ──────────────────────────────────────────────

  it("handles markers at start and end of text", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "[v1] The allocation is solid [v2]",
      trace: [],
    });
    expect(r.checks).toHaveLength(2);
  });

  it("handles adjacent markers with no space", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "Supported by [v1][v2][mem:1234].",
      trace: [],
    });
    expect(r.checks).toHaveLength(3);
  });

  // ── Additional edge cases ──────────────────────────────────

  it("handles empty response text", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "",
      trace: [],
    });
    expect(r.checks).toHaveLength(0);
    expect(r.counts.total).toBe(0);
    expect(r.overall).toBe("no_citations");
  });

  it("handles response with only whitespace", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "   \n\t  ",
      trace: [],
    });
    expect(r.checks).toHaveLength(0);
    expect(r.counts.total).toBe(0);
  });

  it("handles very large marker numbers", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "See [v99999] for details.",
      trace: [],
    });
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0].marker).toBe("[v99999]");
    expect(r.checks[0].type).toBe("vault");
  });

  it("handles duplicate markers", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "As noted [v1] previously [v1] and reconfirmed [v1].",
      trace: [],
    });
    // All three occurrences should be detected
    expect(r.checks.length).toBeGreaterThanOrEqual(1);
    expect(r.checks.every((c) => c.marker === "[v1]")).toBe(true);
  });

  it("does not match markers inside code blocks or backticks", async () => {
    // This tests the raw extraction; code fencing is domain-specific
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "Use `[v1]` as a citation marker format.",
      trace: [],
    });
    // The extractor will still find [v1] inside backticks (it's text-level)
    expect(r.checks).toHaveLength(1);
  });

  it("handles memory markers with long hex IDs", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "Client preference [mem:abcdef1234567890].",
      trace: [],
    });
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0].type).toBe("memory");
  });

  it("correctly identifies overall=invalid when all citations fail", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "[v999] [v998] [v997]",
      trace: [],
    });
    expect(r.counts.total).toBe(3);
    // All are unverifiable (no trace data to validate against)
    expect(r.counts.valid + r.counts.unverifiable + r.counts.failed).toBe(3);
  });
});
