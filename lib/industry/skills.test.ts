import { describe, it, expect } from "vitest";
import {
  getSkillSeed,
  defaultSkillSlugsFor,
  defaultSkillSeedsFor,
  type SkillSeed,
} from "./skills";

describe("skill registry", () => {
  const EXPECTED_SKILLS = [
    "draft_listing_prep_recap",
    "summarize_recent_buyer_emails",
    "prep_briefing_for_showing",
    "abstract_lease",
    "psa_redline_analysis",
    "broker_email_draft",
    "loi_draft",
  ];

  it("getSkillSeed returns null for unknown slug", () => {
    expect(getSkillSeed("nonexistent")).toBeNull();
  });

  it("getSkillSeed returns a skill for every known slug", () => {
    for (const slug of EXPECTED_SKILLS) {
      const seed = getSkillSeed(slug);
      expect(seed, `missing skill: ${slug}`).not.toBeNull();
    }
  });

  it("every skill has required properties", () => {
    for (const slug of EXPECTED_SKILLS) {
      const seed = getSkillSeed(slug) as SkillSeed;
      expect(seed.name).toBeTruthy();
      expect(seed.description).toBeTruthy();
      expect(seed.config).toBeTruthy();
      expect(seed.config.objective).toBeTruthy();
      expect(seed.config.system).toBeTruthy();
      expect(Array.isArray(seed.config.tools)).toBe(true);
      expect(seed.config.tools.length).toBeGreaterThan(0);
      expect(seed.config.max_steps).toBeGreaterThan(0);
      expect(seed.input_schema).toBeTruthy();
      expect(seed.input_schema.type).toBe("object");
      expect(Array.isArray(seed.input_schema.required)).toBe(true);
      expect(typeof seed.auto_approve).toBe("boolean");
    }
  });

  it("every skill has at least one required input", () => {
    for (const slug of EXPECTED_SKILLS) {
      const seed = getSkillSeed(slug) as SkillSeed;
      expect(seed.input_schema.required.length).toBeGreaterThan(0);
    }
  });

  it("every required input has a matching property", () => {
    for (const slug of EXPECTED_SKILLS) {
      const seed = getSkillSeed(slug) as SkillSeed;
      for (const req of seed.input_schema.required) {
        expect(
          seed.input_schema.properties[req],
          `skill ${slug}: required input '${req}' has no property definition`,
        ).toBeTruthy();
      }
    }
  });

  it("skill tools reference valid tool namespaces", () => {
    const validPrefixes = [
      "memory.", "vault.", "archive.", "email.", "contacts.",
      "property.", "sms.", "http.", "web.", "file_index.",
      "site_scan.", "survey_area", "tenant_site_search",
      "cre.", "document.", "agent.",
    ];
    for (const slug of EXPECTED_SKILLS) {
      const seed = getSkillSeed(slug) as SkillSeed;
      for (const tool of seed.config.tools) {
        const valid = validPrefixes.some((p) => tool.startsWith(p));
        expect(valid, `skill ${slug}: tool '${tool}' has unknown namespace`).toBe(true);
      }
    }
  });

  it("max_steps are reasonable (between 1 and 30)", () => {
    for (const slug of EXPECTED_SKILLS) {
      const seed = getSkillSeed(slug) as SkillSeed;
      expect(seed.config.max_steps).toBeGreaterThanOrEqual(1);
      expect(seed.config.max_steps).toBeLessThanOrEqual(30);
    }
  });
});

describe("default skill slugs", () => {
  it("returns all 7 CRE skills", () => {
    const slugs = defaultSkillSlugsFor("real_estate");
    expect(slugs).toHaveLength(7);
  });

  it("returns same slugs regardless of industry argument", () => {
    // After RIA removal, industry argument is ignored
    const cre = defaultSkillSlugsFor("real_estate");
    const noArg = defaultSkillSlugsFor();
    expect(cre).toEqual(noArg);
  });

  it("includes abstract_lease (revenue-critical skill)", () => {
    const slugs = defaultSkillSlugsFor();
    expect(slugs).toContain("abstract_lease");
  });

  it("includes psa_redline_analysis", () => {
    const slugs = defaultSkillSlugsFor();
    expect(slugs).toContain("psa_redline_analysis");
  });

  it("includes broker_email_draft", () => {
    const slugs = defaultSkillSlugsFor();
    expect(slugs).toContain("broker_email_draft");
  });
});

describe("default skill seeds", () => {
  it("returns full SkillSeed objects for all defaults", () => {
    const seeds = defaultSkillSeedsFor();
    expect(seeds).toHaveLength(7);
    for (const s of seeds) {
      expect(s.name).toBeTruthy();
      expect(s.config).toBeTruthy();
    }
  });

  it("every default seed name matches its slug", () => {
    const slugs = defaultSkillSlugsFor();
    const seeds = defaultSkillSeedsFor();
    for (let i = 0; i < slugs.length; i++) {
      expect(seeds[i].name).toBe(slugs[i]);
    }
  });
});

describe("individual skill validation", () => {
  it("abstract_lease uses vault.cite for citation grounding", () => {
    const seed = getSkillSeed("abstract_lease") as SkillSeed;
    expect(seed.config.tools).toContain("vault.cite");
  });

  it("psa_redline_analysis uses both vault.cite and archive.search", () => {
    const seed = getSkillSeed("psa_redline_analysis") as SkillSeed;
    expect(seed.config.tools).toContain("vault.cite");
    expect(seed.config.tools).toContain("archive.search");
  });

  it("broker_email_draft is NOT auto-approved (human review required)", () => {
    const seed = getSkillSeed("broker_email_draft") as SkillSeed;
    expect(seed.auto_approve).toBe(false);
  });

  it("draft_listing_prep_recap is NOT auto-approved", () => {
    const seed = getSkillSeed("draft_listing_prep_recap") as SkillSeed;
    expect(seed.auto_approve).toBe(false);
  });

  it("loi_draft uses vault.cite and memory.search", () => {
    const seed = getSkillSeed("loi_draft") as SkillSeed;
    expect(seed.config.tools).toContain("vault.cite");
    expect(seed.config.tools).toContain("memory.search");
  });

  it("loi_draft is NOT auto-approved (legal document)", () => {
    const seed = getSkillSeed("loi_draft") as SkillSeed;
    expect(seed.auto_approve).toBe(false);
  });

  it("loi_draft requires property_name and representation", () => {
    const seed = getSkillSeed("loi_draft") as SkillSeed;
    expect(seed.input_schema.required).toContain("property_name");
    expect(seed.input_schema.required).toContain("representation");
  });

  it("loi_draft has optional tenant_entity and terms fields", () => {
    const seed = getSkillSeed("loi_draft") as SkillSeed;
    expect(seed.input_schema.properties).toHaveProperty("tenant_entity");
    expect(seed.input_schema.properties).toHaveProperty("terms");
    expect(seed.input_schema.required).not.toContain("tenant_entity");
    expect(seed.input_schema.required).not.toContain("terms");
  });

  it("includes loi_draft in defaults", () => {
    const slugs = defaultSkillSlugsFor();
    expect(slugs).toContain("loi_draft");
  });
});
