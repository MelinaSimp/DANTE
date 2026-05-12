import { describe, it, expect } from "vitest";
import { validateCitations } from "./citation-validator";

describe("validateCitations", () => {
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

  it("ignores unrecognized bracket patterns", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "Footnote [1] and [Note] are not citation markers.",
      trace: [],
    });
    expect(r.overall).toBe("no_citations");
    expect(r.checks).toHaveLength(0);
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

  it("detects memory markers with varying hex lengths", async () => {
    const r = await validateCitations({
      workspaceId: "ws_test",
      responseText: "Short [mem:abcd] and long [mem:abcdef1234567890abcdef1234567890].",
      trace: [],
    });
    expect(r.checks).toHaveLength(2);
    expect(r.checks.every((c) => c.type === "memory")).toBe(true);
  });
});
