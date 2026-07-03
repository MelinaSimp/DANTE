import { describe, it, expect } from "vitest";
import {
  validateBlueprint,
  DEFAULT_AGENT_MODEL,
  type AgentBlueprint,
} from "./agent-blueprint";

describe("validateBlueprint", () => {
  const good = {
    name: "Support Bot",
    description: "Answers customer questions about our plumbing services.",
    persona: "You are a friendly support agent for a plumbing company.",
    first_message: "Hi! How can I help with your plumbing needs today?",
    model: "claude-sonnet-4-6",
    skills: ["draft_follow_up_email"],
    tools: ["memory.search", "email.send"],
  };

  it("accepts a well-formed blueprint", () => {
    const { ok, blueprint, errors } = validateBlueprint(good);
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
    expect(blueprint.name).toBe("Support Bot");
  });

  it("drops unknown tools and skills instead of failing", () => {
    const { blueprint } = validateBlueprint({
      ...good,
      tools: ["memory.search", "cre.calculate", "email.send"],
      skills: ["draft_follow_up_email", "abstract_lease"],
    });
    expect(blueprint.tools).toEqual(["memory.search", "email.send"]);
    expect(blueprint.skills).toEqual(["draft_follow_up_email"]);
  });

  it("fills a default model when missing or unknown", () => {
    const { blueprint } = validateBlueprint({ ...good, model: "" });
    expect(blueprint.model).toBe(DEFAULT_AGENT_MODEL);
  });

  it("flags a missing name as an error", () => {
    const { ok, errors } = validateBlueprint({ ...good, name: "   " });
    expect(ok).toBe(false);
    expect(errors.join(" ")).toMatch(/name/i);
  });

  it("flags a missing persona as an error", () => {
    const { ok, errors } = validateBlueprint({ ...good, persona: "" });
    expect(ok).toBe(false);
    expect(errors.join(" ")).toMatch(/persona/i);
  });

  it("coerces non-array skills/tools to empty arrays", () => {
    const { blueprint } = validateBlueprint({
      ...good,
      skills: "not-an-array" as unknown as string[],
      tools: undefined as unknown as string[],
    });
    expect(blueprint.skills).toEqual([]);
    expect(blueprint.tools).toEqual([]);
  });

  it("truncates an over-long name to 80 chars", () => {
    const { blueprint } = validateBlueprint({ ...good, name: "x".repeat(200) });
    expect(blueprint.name.length).toBe(80);
  });

  it("returns a fully-typed AgentBlueprint even for garbage input", () => {
    const { ok, blueprint } = validateBlueprint({});
    expect(ok).toBe(false);
    const bp: AgentBlueprint = blueprint; // type-checks
    expect(Array.isArray(bp.tools)).toBe(true);
    expect(Array.isArray(bp.skills)).toBe(true);
  });
});
