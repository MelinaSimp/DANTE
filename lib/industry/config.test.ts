import { describe, it, expect } from "vitest";
import { getIndustryConfig } from "./config";

// Foundation plan: copy must be platform-neutral. The internal
// `industry` key remains "real_estate" (legacy; renamed in the
// workspace-templates plan), so it is deliberately NOT asserted here.
describe("industry config (generalized)", () => {
  const cfg = getIndustryConfig();
  const CRE_PATTERN = /parcel|lease|zoning|broker|real estate|\bCRE\b/i;

  it("marketing and chat copy is platform-neutral", () => {
    const copyFields = [
      cfg.eyebrow,
      cfg.shortLabel,
      cfg.marketingHeadline,
      cfg.marketingDescription,
      cfg.displayName,
      cfg.danteHero,
      cfg.danteSubtitle,
      cfg.chatPlaceholder,
      ...cfg.marketingChips,
      ...cfg.starterQuestions,
    ];
    for (const field of copyFields) {
      expect(field, `CRE language leaked into: "${field}"`).not.toMatch(CRE_PATTERN);
    }
  });

  it("assistant is Dante", () => {
    expect(cfg.assistantName).toBe("Dante");
  });

  it("seeds the generic default skills", () => {
    expect(cfg.seededSkills).toEqual([
      "draft_follow_up_email",
      "summarize_recent_emails",
      "prep_meeting_briefing",
    ]);
  });
});
