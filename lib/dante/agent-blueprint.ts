// lib/dante/agent-blueprint.ts
//
// The structured agent configuration the Agent Architect produces and
// the /agent/new UI previews. validateBlueprint() is pure: it coerces
// arbitrary LLM output into a fully-typed blueprint, filters tools and
// skills against the generic catalog, and reports human-readable errors
// for the fields a user must supply before an agent can be created.

import { filterKnownSkills, filterKnownTools } from "./agent-catalog";

export const DEFAULT_AGENT_MODEL = "claude-sonnet-4-6";

/** Models the builder offers. Keep in sync with lib/dante/model-router. */
export const BUILDER_MODELS = [
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
] as const;

export interface AgentBlueprint {
  name: string;
  description: string;
  persona: string; // → agents.llm_instructions
  first_message: string; // → agents.first_message
  model: string; // → agents.llm_model
  skills: string[]; // generic skill slugs
  tools: string[]; // generic tool ids
}

export interface BlueprintValidation {
  ok: boolean;
  blueprint: AgentBlueprint;
  errors: string[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function validateBlueprint(raw: unknown): BlueprintValidation {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];

  const name = str(obj.name).trim().slice(0, 80);
  if (!name) errors.push("Agent needs a name.");

  const persona = str(obj.persona).trim();
  if (!persona) errors.push("Agent needs a persona (system prompt).");

  const rawModel = str(obj.model).trim();
  const model = (BUILDER_MODELS as readonly string[]).includes(rawModel)
    ? rawModel
    : DEFAULT_AGENT_MODEL;

  const blueprint: AgentBlueprint = {
    name,
    description: str(obj.description).trim().slice(0, 280),
    persona,
    first_message: str(obj.first_message).trim().slice(0, 500),
    model,
    skills: filterKnownSkills(strArray(obj.skills)),
    tools: filterKnownTools(strArray(obj.tools)),
  };

  return { ok: errors.length === 0, blueprint, errors };
}
