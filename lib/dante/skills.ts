// lib/dante/skills.ts
//
// Phase 3 — workspace-customizable named skills. A skill is a stored
// agent-step config that the agent loop can call as `skill.run`. The
// runner looks it up by (workspace_id, name), inflates it into an
// inline AgentStep, and runs the loop with the caller-supplied input
// merged into the objective template.
//
// Why route through the existing agent loop rather than a bespoke
// executor: composability. A skill that calls `clients.query` then
// `email.send` should obey the SAME per-tool budgets and simulate
// semantics as a top-level agent node. Reusing runAgent gets that
// for free.
//
// Compliance note: skills with auto_approve=false should be invoked
// in `simulate=true` by default when client-facing copy is at stake.
// The agent loop already wires simulate-mode through to mutating
// tools, so a skill that drafts an email returns a `would_have`
// payload for the advisor to approve before the real send fires.

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AgentStep, StepLogEntry } from "./workflow-types";

export interface RunSkillInput {
  workspaceId: string;
  name: string;
  input: Record<string, unknown>;
  simulate: boolean;
  runId: string;
  log: StepLogEntry[];
  parentStepId: string;
}

export interface RunSkillResult {
  text: string;
  output: unknown;
  steps_taken: number;
  truncated: boolean;
  skill_version: number;
}

/**
 * Load the highest-versioned enabled row for (workspace, name) and
 * run it. Returns the agent loop's final output.
 *
 * IMPORTANT: this lives in its own file (and is imported by agent.ts)
 * because runAgent needs to call into it from the skill.run dispatch
 * branch — we route around the cycle by using a dynamic import below.
 */
export async function runSkill(input: RunSkillInput): Promise<RunSkillResult> {
  const { data, error } = await supabaseAdmin
    .from("dante_skills")
    .select("id, name, version, description, config, input_schema, auto_approve")
    .eq("workspace_id", input.workspaceId)
    .eq("name", input.name)
    .eq("enabled", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`runSkill: ${error.message}`);
  if (!data) throw new Error(`Skill not found: ${input.name}`);

  const skill = data as {
    id: string;
    name: string;
    version: number;
    description: string;
    config: AgentStep["config"];
    input_schema: object;
    auto_approve: boolean;
  };

  // Build the inline agent step. The skill's stored config supplies
  // the system prompt + tool whitelist + objective template; we
  // substitute caller input via {{input.<key>}} before handing off.
  // resolveTemplate already runs over the cfg by the time we'd be
  // reading it from inside runAgent — but skills come in raw, so we
  // do a tiny substitution here.
  const objective = renderTemplate(skill.config.objective, input.input);

  const inlineStep: AgentStep = {
    id: `${input.parentStepId}/skill:${skill.name}@v${skill.version}`,
    type: "agent",
    name: `skill:${skill.name}`,
    config: {
      ...skill.config,
      objective,
    },
  };

  // Force simulate=true for non-auto-approved skills with mutating
  // tools — compliance lever. Advisor sees "would have done" output
  // and can approve before live mutation.
  const hasMutatingTool = (skill.config.tools || []).some(
    (t) => typeof t === "string" && (t === "email.send" || t === "clients.update"),
  );
  const effectiveSimulate = input.simulate || (!skill.auto_approve && hasMutatingTool);

  // Dynamic import to break the agent.ts ↔ skills.ts cycle. ESM
  // handles this correctly at runtime; the cycle would otherwise
  // give us a partially-initialized module.
  const { runAgent } = await import("./agent");
  const result = await runAgent({
    step: inlineStep,
    workspaceId: input.workspaceId,
    simulate: effectiveSimulate,
    runId: input.runId,
    log: input.log,
  });

  return { ...result, skill_version: skill.version };
}

function renderTemplate(template: string, input: Record<string, unknown>): string {
  return template.replace(/\{\{\s*input\.([^}\s]+)\s*\}\}/g, (_, key: string) => {
    const v = input[key];
    if (v == null) return "";
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}
