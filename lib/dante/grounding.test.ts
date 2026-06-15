import { describe, it, expect } from "vitest";
import { computeGroundingScore } from "./grounding";
import type { CitationValidationReport } from "./citation-validator";

function makeReport(
  overrides: Partial<CitationValidationReport> & Pick<CitationValidationReport, "checks" | "counts">,
): CitationValidationReport {
  return {
    overall: overrides.overall ?? "valid",
    checks: overrides.checks,
    counts: overrides.counts,
  };
}

describe("computeGroundingScore", () => {
  it("returns tier=none and score=0 for empty response with no tools", () => {
    const r = computeGroundingScore({
      responseText: "",
      trace: [],
    });
    expect(r.score).toBe(0);
    expect(r.tier).toBe("none");
  });

  it("returns tier=none for plain text with no citations and no tools", () => {
    const r = computeGroundingScore({
      responseText: "Here is some general advice about investing.",
      trace: [],
    });
    expect(r.score).toBe(0);
    expect(r.tier).toBe("none");
  });

  it("returns tier=none when tools called but none are retrieval", () => {
    const r = computeGroundingScore({
      responseText: "Done. I sent the email.",
      trace: [
        { step_name: "agent → email.send", status: "success" },
      ],
    });
    expect(r.tier).toBe("none");
    expect(r.score).toBe(0);
  });

  it("returns tier=strong with high citation density and retrieval tools", () => {
    const r = computeGroundingScore({
      responseText:
        "Per the IPS [v1], cash allocation is capped at 5%. The advisor noted [mem:abcd1234] that the client prefers bond ladders. Regulatory guidance [reg:1] supports this approach.",
      trace: [
        { step_name: "agent → memory_search", status: "success" },
        { step_name: "agent → vault_cite", status: "success" },
        { step_name: "agent → regulatory_search", status: "success" },
      ],
      citationReport: makeReport({
        checks: [
          { marker: "[v1]", type: "vault", status: "valid" },
          { marker: "[mem:abcd1234]", type: "memory", status: "valid" },
          { marker: "[reg:1]", type: "regulatory", status: "valid" },
        ],
        counts: { total: 3, valid: 3, failed: 0, unverifiable: 0 },
      }),
    });
    expect(r.tier).toBe("strong");
    expect(r.score).toBeGreaterThanOrEqual(0.7);
    expect(r.parts.citation_count).toBe(3);
    expect(r.parts.retrieval_tools_called).toBe(3);
  });

  it("returns tier=partial when sparse citations and all invalid", () => {
    const longText = "The policy document covers many different areas of portfolio management including asset allocation strategies diversification requirements rebalancing schedules and risk tolerance assessments for each client profile that the advisor manages on behalf of the firm [v1]. Additional sections discuss compliance requirements and regulatory considerations that must be reviewed annually with all distribution requests requiring documented approval from the compliance department [v2].";
    const r = computeGroundingScore({
      responseText: longText,
      trace: [
        { step_name: "agent → vault_cite", status: "success" },
        { step_name: "agent → email.send", status: "success" },
        { step_name: "agent → clients_query", status: "success" },
      ],
      citationReport: makeReport({
        overall: "invalid",
        checks: [
          { marker: "[v1]", type: "vault", status: "missing" },
          { marker: "[v2]", type: "vault", status: "missing" },
        ],
        counts: { total: 2, valid: 0, failed: 2, unverifiable: 0 },
      }),
    });
    expect(r.tier).toBe("partial");
    expect(r.parts.validator_pass_rate).toBe(0);
  });

  it("scores 0 validator_pass_rate when retrieval called but zero citations emitted", () => {
    const r = computeGroundingScore({
      responseText: "I looked into your question and here is what I found about the market.",
      trace: [
        { step_name: "agent → memory_search", status: "success" },
        { step_name: "agent → archive_search", status: "success" },
      ],
    });
    expect(r.parts.validator_pass_rate).toBe(0);
    expect(r.parts.retrieval_tools_called).toBe(2);
    expect(r.parts.citation_count).toBe(0);
  });

  it("handles mixed retrieval and non-retrieval tools", () => {
    const r = computeGroundingScore({
      responseText: "Based on the docs [v1], I updated the contact.",
      trace: [
        { step_name: "agent → vault_cite", status: "success" },
        { step_name: "agent → clients_query", status: "success" },
        { step_name: "agent → email.send", status: "success" },
      ],
    });
    expect(r.parts.retrieval_tools_called).toBe(2);
    expect(r.parts.total_tools_called).toBe(3);
    expect(r.parts.tool_grounding).toBeCloseTo(0.67, 1);
  });

  it("recognizes regulatory citation markers [reg:N]", () => {
    const r = computeGroundingScore({
      responseText: "According to SEC guidance [reg:42], this is required.",
      trace: [
        { step_name: "agent → regulatory_search", status: "success" },
      ],
    });
    expect(r.parts.citation_count).toBe(1);
    expect(r.parts.retrieval_tools_called).toBe(1);
  });

  it("handles step_name with arrow prefix correctly", () => {
    const r = computeGroundingScore({
      responseText: "Test [v1].",
      trace: [
        { step_name: "agent → memory.search", status: "success" },
        { step_name: "memory_search", status: "success" },
      ],
    });
    expect(r.parts.retrieval_tools_called).toBe(2);
  });

  it("caps citation_density at 1.0 even with extreme density", () => {
    const r = computeGroundingScore({
      responseText: "[v1] [v2] [v3] [v4] [v5] yes",
      trace: [{ step_name: "agent → vault_cite", status: "success" }],
    });
    expect(r.parts.citation_density).toBeLessThanOrEqual(1);
  });

  it("score is capped at 1.0", () => {
    const r = computeGroundingScore({
      responseText: "[v1] [v2] [v3] word word word word [mem:aaaa]",
      trace: [
        { step_name: "vault_cite", status: "success" },
        { step_name: "memory_search", status: "success" },
      ],
      citationReport: makeReport({
        checks: [
          { marker: "[v1]", type: "vault", status: "valid" },
          { marker: "[v2]", type: "vault", status: "valid" },
          { marker: "[v3]", type: "vault", status: "valid" },
          { marker: "[mem:aaaa]", type: "memory", status: "valid" },
        ],
        counts: { total: 4, valid: 4, failed: 0, unverifiable: 0 },
      }),
    });
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it("tier=partial when retrieval tools called but response has no citations", () => {
    const r = computeGroundingScore({
      responseText: "I checked the documents and here is some general advice about leasing strategies.",
      trace: [
        { step_name: "agent → vault_cite", status: "success" },
      ],
    });
    expect(r.tier).toBe("partial");
    expect(r.parts.retrieval_tools_called).toBe(1);
    expect(r.parts.citation_count).toBe(0);
  });

  it("counts failed tool calls the same as successful ones", () => {
    const r = computeGroundingScore({
      responseText: "I tried to look it up but couldn't find anything.",
      trace: [
        { step_name: "agent → vault_cite", status: "error" },
        { step_name: "agent → memory_search", status: "error" },
      ],
    });
    // The grounding score counts all trace entries regardless of status
    expect(r.parts.retrieval_tools_called).toBe(2);
    expect(r.parts.total_tools_called).toBe(2);
  });

  it("handles very long response with few citations (low density)", () => {
    const longText = "word ".repeat(500) + "[v1]";
    const r = computeGroundingScore({
      responseText: longText,
      trace: [{ step_name: "vault_cite", status: "success" }],
    });
    expect(r.parts.citation_density).toBeLessThan(0.1);
    expect(r.parts.citation_count).toBe(1);
  });

  it("handles empty trace with citations (high density gives strong tier)", () => {
    const r = computeGroundingScore({
      responseText: "Just some advice [v1].",
      trace: [],
    });
    expect(r.parts.total_tools_called).toBe(0);
    expect(r.parts.retrieval_tools_called).toBe(0);
    expect(r.parts.citation_count).toBe(1);
    // With high citation density (1 citation per 4 words), the score
    // can still cross the 0.7 strong threshold via citation_density alone
    expect(["strong", "partial"]).toContain(r.tier);
  });

  it("treats archive_search as a retrieval tool", () => {
    const r = computeGroundingScore({
      responseText: "Found in archive [v1].",
      trace: [{ step_name: "agent → archive_search", status: "success" }],
    });
    expect(r.parts.retrieval_tools_called).toBe(1);
  });

  it("file_index.search is not a retrieval tool (counts as general)", () => {
    const r = computeGroundingScore({
      responseText: "Found in file index [v1].",
      trace: [{ step_name: "agent → file_index.search", status: "success" }],
    });
    // file_index.search is not in RETRIEVAL_TOOLS
    expect(r.parts.retrieval_tools_called).toBe(0);
    expect(r.parts.total_tools_called).toBe(1);
  });

  it("summary mentions vault + memory + regulatory counts for strong tier", () => {
    const r = computeGroundingScore({
      responseText: "Per [v1] and [mem:1234] and [reg:1], this is well-supported advice for your situation.",
      trace: [
        { step_name: "vault_cite", status: "success" },
        { step_name: "memory_search", status: "success" },
        { step_name: "regulatory_search", status: "success" },
      ],
      citationReport: makeReport({
        checks: [
          { marker: "[v1]", type: "vault", status: "valid" },
          { marker: "[mem:1234]", type: "memory", status: "valid" },
          { marker: "[reg:1]", type: "regulatory", status: "valid" },
        ],
        counts: { total: 3, valid: 3, failed: 0, unverifiable: 0 },
      }),
    });
    expect(r.summary).toContain("vault");
    expect(r.summary).toContain("memory");
    expect(r.summary).toContain("regulatory");
  });
});
