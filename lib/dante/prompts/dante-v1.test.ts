import { describe, it, expect } from "vitest";
import { DANTE_V1_PROMPT, DANTE_V1_VERSION } from "./dante-v1";

describe("dante-v1 prompt", () => {
  it("has a version", () => {
    expect(DANTE_V1_VERSION).toBe("1.0");
  });

  it("is platform-neutral (no CRE persona)", () => {
    expect(DANTE_V1_PROMPT).not.toMatch(
      /commercial real estate|CRE broker|lease abstract|cre\.calculate|parcel|brokerage/i,
    );
  });

  it("keeps the anti-disclaimer identity rule", () => {
    expect(DANTE_V1_PROMPT).toContain("You are the platform. Act like it.");
  });

  it("keeps citation grounding instructions", () => {
    expect(DANTE_V1_PROMPT).toContain("vault.cite");
    expect(DANTE_V1_PROMPT).toMatch(/\[v1\]/);
  });
});
