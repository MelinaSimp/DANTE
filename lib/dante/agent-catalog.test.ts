import { describe, it, expect } from "vitest";
import {
  GENERIC_TOOLS,
  GENERIC_SKILLS,
  isKnownTool,
  isKnownSkill,
  filterKnownTools,
  filterKnownSkills,
} from "./agent-catalog";

describe("agent catalog", () => {
  it("exposes platform-neutral tools only (no CRE tools)", () => {
    const ids = GENERIC_TOOLS.map((t) => t.id);
    for (const creTool of [
      "cre.calculate",
      "properties.query",
      "site_scan.search",
      "regulatory.search",
    ]) {
      expect(ids).not.toContain(creTool);
    }
  });

  it("includes the core generic tools", () => {
    const ids = GENERIC_TOOLS.map((t) => t.id);
    for (const t of [
      "memory.search",
      "vault.cite",
      "archive.search",
      "clients.query",
      "email.send",
      "web.search",
      "skill.run",
    ]) {
      expect(ids).toContain(t);
    }
  });

  it("every tool has an id and an LLM-facing description", () => {
    for (const t of GENERIC_TOOLS) {
      expect(t.id).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(10);
    }
  });

  it("skills catalog lists the three generic seeded skills", () => {
    const slugs = GENERIC_SKILLS.map((s) => s.slug);
    expect(slugs).toEqual([
      "draft_follow_up_email",
      "summarize_recent_emails",
      "prep_meeting_briefing",
    ]);
  });

  it("isKnownTool / isKnownSkill gate membership", () => {
    expect(isKnownTool("memory.search")).toBe(true);
    expect(isKnownTool("cre.calculate")).toBe(false);
    expect(isKnownSkill("draft_follow_up_email")).toBe(true);
    expect(isKnownSkill("abstract_lease")).toBe(false);
  });

  it("filter helpers drop unknown ids", () => {
    expect(filterKnownTools(["memory.search", "cre.calculate", "email.send"])).toEqual([
      "memory.search",
      "email.send",
    ]);
    expect(filterKnownSkills(["draft_follow_up_email", "abstract_lease"])).toEqual([
      "draft_follow_up_email",
    ]);
  });
});
