# Agent Builder — Conversational Agent Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user describe an agent in plain English, have Dante generate a complete, editable agent configuration (persona, first message, model, skills, tools), refine it through guided follow-up questions, then create and deploy it — the "Build by Chatting" flow from spec §1.1.

**Architecture:** A new stateless "agent architect" module (`lib/dante/agent-architect.ts`) turns a conversation transcript into a validated `AgentBlueprint` on each turn by calling the existing multi-provider LLM client with a JSON-object response format. A generic tool/skill catalog (`lib/dante/agent-catalog.ts`) bounds what the architect may suggest to the platform-neutral subset. A new API route drives the turn loop; a new `/agent/new` UI shows chat on the left and a live config preview on the right. Creation persists into the **existing** `agents` table (reusing `llm_instructions`, `first_message`, `llm_model`) plus one new `builder_config jsonb` column for the selected skills/tools, then hands off to the existing `/agent/[id]` editor for power-user tweaks. Deploy and test reuse existing routes.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Vitest, Supabase (Postgres + RLS), the in-repo `@/lib/llm/client` `complete()` wrapper.

---

## Prerequisites

- The `dante-foundation` plan (2026-07-03-dante-foundation.md) is merged: platform-neutral config, generic seeded skills (`draft_follow_up_email`, `summarize_recent_emails`, `prep_meeting_briefing`), and the `dante-v1` system prompt are in place. This plan suggests those skills by slug and assumes they are seeded on onboarding.

## Existing surfaces this plan builds on (do not rebuild)

- **`agents` table** — columns already present: `id`, `workspace_id`, `name`, `modality`, `description`, `status` (`draft`|`deployed`|`archived`), `llm_instructions` (persona/system prompt), `first_message`, `llm_model`, `mode` (`llm`|`scenario`), `scenario` (jsonb), plus voice/schedule columns. This plan writes persona→`llm_instructions`, greeting→`first_message`, model→`llm_model`, and adds one `builder_config jsonb` column for skills+tools.
- **`POST /api/agents`** ([app/api/agents/route.ts](../../../app/api/agents/route.ts)) — existing create path used by the roster "New agent" modal (name + modality only). Left untouched; this plan adds a sibling `POST /api/agents/from-blueprint`.
- **`app/agent/[agentId]/AgentConfigClient.tsx`** — the existing power-user editor. The architect hands off to it after creation (redirect to `/agent/[id]`).
- **`dante_skills` table** + `lib/industry/skills.ts` — the skill registry. The architect suggests skills by slug from the generic catalog.
- **Tool registry in `lib/dante/agent.ts`** — ~40 registered tools keyed like `memory.search`, `email.send`. The generic catalog in this plan is a curated subset of those keys (CRE tools like `cre.calculate`, `properties.*`, `site_scan.*`, `regulatory.*` are excluded).
- **`@/lib/llm/client` `complete(opts)`** — signature: `{ model, messages: LlmMessage[], responseFormat?: {type:"json_object"}, temperature?, feature?, workspaceId? }` → `{ message: { content: string|null }, usage, ... }`. `LlmMessage` = `{ role: "system"|"user"|"assistant", content: string }`.
- **`POST /api/agents/[agentId]/test`** — existing test-conversation endpoint. The new UI links to it; no change needed.
- **Deploy** = `PATCH /api/agents/[agentId]` setting `status: "deployed"` — already supported.

## Scope boundaries (explicitly deferred to later plans)

- **Eval suites, A/B testing, conversation replay, grounding-score dashboard** (spec §1.4) — separate "Agent Testing & Evaluation" plan.
- **Guardrails validation layer** (spec §1.2) — the `/api/agents/[agentId]/policies` route exists; wiring a runtime validation layer is a separate "Agent Guardrails" plan. This plan lets the architect *write persona-level* boundaries into `llm_instructions` but does not build the enforcement layer.
- **Per-agent runtime tool enforcement** — this plan *persists* the selected tool list in `builder_config`; making the agent loop honor a per-agent allowlist is a follow-up. Note this in the create route so it isn't mistaken for enforced.
- **Memory-tier configuration UI** (spec §1.2) — memory already works globally; per-agent memory scoping is later.
- **Voice/SMS/channel wiring** (spec §4) — created agents are chat-modality; channels are a later plan.

---

## File Structure

- Create `lib/dante/agent-catalog.ts` — the generic tool + skill catalog the architect may suggest (single source of truth, pure data + lookup helpers).
- Create `lib/dante/agent-blueprint.ts` — the `AgentBlueprint` type + `validateBlueprint()` (pure validation/coercion, no I/O).
- Create `lib/dante/agent-architect.ts` — `runArchitectTurn()`; calls the LLM, parses+validates the blueprint, returns the turn result.
- Create `supabase/migrations/20260703000000_add_agents_builder_config.sql` — adds `builder_config jsonb` to `agents`.
- Create `app/api/agents/architect/route.ts` — stateless turn endpoint.
- Create `app/api/agents/from-blueprint/route.ts` — creates an agent row from a validated blueprint.
- Create `app/agent/new/page.tsx` — server page (workspace context + AppShell).
- Create `app/agent/new/AgentArchitectClient.tsx` — the split chat + live-preview UI.
- Modify `app/agent/AgentRosterClient.tsx` — add a "Build by chatting" entry point.
- Modify `scripts/check-schema.ts` — add `builder_config` to the `agents` manifest entry.

---

### Task 0: Branch and baseline

**Files:** none modified.

- [ ] **Step 1: Branch from up-to-date main**

```bash
cd /Users/lucaoravecz/Desktop/DANTE/drift-crm
git checkout main && git pull --ff-only 2>/dev/null; git checkout -b agent-builder
```

- [ ] **Step 2: Baseline test + typecheck**

```bash
npm test 2>&1 | tail -4
npx tsc --noEmit 2>&1 | tail -3; echo "tsc exit: $?"
```

Expected: 300 tests pass, tsc exit 0 (the dante-foundation baseline). Record any pre-existing failures; "green" means no new failures vs. this baseline.

---

### Task 1: Generic agent catalog (TDD)

**Files:**
- Test: `lib/dante/agent-catalog.test.ts` (create)
- Create: `lib/dante/agent-catalog.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/dante/agent-catalog.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/dante/agent-catalog.test.ts
```

Expected: FAIL — `Cannot find module './agent-catalog'`.

- [ ] **Step 3: Create `lib/dante/agent-catalog.ts`**

```ts
// lib/dante/agent-catalog.ts
//
// The platform-neutral subset of tools and skills the Agent Architect
// is allowed to suggest when building an agent from a description.
//
// Tool ids mirror keys in the runtime tool registry (lib/dante/agent.ts).
// CRE-specific tools (cre.calculate, properties.*, site_scan.*,
// regulatory.*) are intentionally excluded — they belong to the future
// Drift CRE template, not the horizontal default.
//
// Skill slugs mirror the generic seeds in lib/industry/skills.ts.

export interface CatalogTool {
  id: string;
  /** Short label for the config preview UI. */
  label: string;
  /** One-line description the architect LLM reads when choosing tools. */
  description: string;
}

export interface CatalogSkill {
  slug: string;
  label: string;
  description: string;
}

export const GENERIC_TOOLS: CatalogTool[] = [
  { id: "memory.search", label: "Search memory", description: "Recall stored facts about a contact — preferences, commitments, past conversations." },
  { id: "memory.write", label: "Write memory", description: "Persist a new fact about a contact for future conversations." },
  { id: "archive.search", label: "Search documents", description: "Search the workspace document vault for relevant passages." },
  { id: "vault.cite", label: "Cite a document", description: "Retrieve an exact document passage with a citation marker for grounded answers." },
  { id: "clients.query", label: "Query contacts", description: "Look up contacts by structured filters (stage, last-contacted date, tags)." },
  { id: "clients.create", label: "Create contact", description: "Add a new contact record from conversation details." },
  { id: "clients.update", label: "Update contact", description: "Update fields on an existing contact record." },
  { id: "email.send", label: "Send email", description: "Draft and send an email (queued for review unless auto-send is enabled)." },
  { id: "reminder.schedule", label: "Schedule reminder", description: "Schedule a follow-up reminder for the user." },
  { id: "web.search", label: "Web search", description: "Search the public web for current information." },
  { id: "http.fetch", label: "Fetch a URL", description: "Fetch and read the contents of a public URL." },
  { id: "document.create", label: "Generate document", description: "Generate a branded PDF document from structured sections." },
  { id: "workflow.list", label: "List workflows", description: "List the workspace's automation workflows." },
  { id: "workflow.run", label: "Run a workflow", description: "Trigger one of the workspace's automation workflows." },
  { id: "skill.run", label: "Run a skill", description: "Invoke one of the workspace's named skills (see skills catalog)." },
];

export const GENERIC_SKILLS: CatalogSkill[] = [
  { slug: "draft_follow_up_email", label: "Draft follow-up email", description: "Draft a follow-up email grounded in memory and vault documents." },
  { slug: "summarize_recent_emails", label: "Summarize recent emails", description: "Roll up the last 14 days of correspondence with a contact into a 4-bullet brief." },
  { slug: "prep_meeting_briefing", label: "Prep meeting briefing", description: "Assemble a pre-meeting brief: who the contact is, history, open items, talking points." },
];

const TOOL_IDS = new Set(GENERIC_TOOLS.map((t) => t.id));
const SKILL_SLUGS = new Set(GENERIC_SKILLS.map((s) => s.slug));

export function isKnownTool(id: string): boolean {
  return TOOL_IDS.has(id);
}

export function isKnownSkill(slug: string): boolean {
  return SKILL_SLUGS.has(slug);
}

export function filterKnownTools(ids: string[]): string[] {
  return ids.filter((id) => TOOL_IDS.has(id));
}

export function filterKnownSkills(slugs: string[]): string[] {
  return slugs.filter((s) => SKILL_SLUGS.has(s));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/dante/agent-catalog.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dante/agent-catalog.ts lib/dante/agent-catalog.test.ts
git commit -m "feat: generic agent tool + skill catalog for the architect"
```

---

### Task 2: AgentBlueprint type + validation (TDD)

**Files:**
- Test: `lib/dante/agent-blueprint.test.ts` (create)
- Create: `lib/dante/agent-blueprint.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/dante/agent-blueprint.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/dante/agent-blueprint.test.ts
```

Expected: FAIL — `Cannot find module './agent-blueprint'`.

- [ ] **Step 3: Create `lib/dante/agent-blueprint.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/dante/agent-blueprint.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dante/agent-blueprint.ts lib/dante/agent-blueprint.test.ts
git commit -m "feat: AgentBlueprint type and pure validateBlueprint()"
```

---

### Task 3: Agent Architect turn engine (TDD with mocked LLM)

**Files:**
- Test: `lib/dante/agent-architect.test.ts` (create)
- Create: `lib/dante/agent-architect.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/dante/agent-architect.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM client before importing the module under test.
vi.mock("@/lib/llm/client", () => ({
  complete: vi.fn(),
}));

import { complete } from "@/lib/llm/client";
import { runArchitectTurn } from "./agent-architect";

const mockComplete = vi.mocked(complete);

function llmReturns(json: object) {
  mockComplete.mockResolvedValueOnce({
    message: { role: "assistant", content: JSON.stringify(json) },
    finishReason: "stop",
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    raw: {},
  } as never);
}

describe("runArchitectTurn", () => {
  beforeEach(() => mockComplete.mockReset());

  it("returns the assistant reply, a validated blueprint, and ready flag", async () => {
    llmReturns({
      reply: "Got it — I've set up a support agent. Want me to add appointment booking?",
      ready: false,
      blueprint: {
        name: "Plumbing Support",
        description: "Support agent for a plumbing company.",
        persona: "You are a friendly support agent for Joe's Plumbing.",
        first_message: "Hi! How can I help today?",
        model: "claude-sonnet-4-6",
        skills: ["draft_follow_up_email"],
        tools: ["memory.search", "email.send"],
      },
    });

    const result = await runArchitectTurn({
      transcript: [{ role: "user", content: "I need a support agent for my plumbing company." }],
      workspaceId: "ws-1",
    });

    expect(result.reply).toMatch(/support agent/i);
    expect(result.ready).toBe(false);
    expect(result.blueprint.name).toBe("Plumbing Support");
    expect(result.blueprint.tools).toEqual(["memory.search", "email.send"]);
  });

  it("strips CRE tools the model tries to suggest", async () => {
    llmReturns({
      reply: "Done.",
      ready: true,
      blueprint: {
        name: "Bot",
        description: "d",
        persona: "p",
        first_message: "hi",
        model: "claude-sonnet-4-6",
        skills: ["abstract_lease", "draft_follow_up_email"],
        tools: ["cre.calculate", "memory.search"],
      },
    });

    const result = await runArchitectTurn({
      transcript: [{ role: "user", content: "build me something" }],
      workspaceId: "ws-1",
    });

    expect(result.blueprint.tools).toEqual(["memory.search"]);
    expect(result.blueprint.skills).toEqual(["draft_follow_up_email"]);
  });

  it("forces ready=false when the blueprint fails validation", async () => {
    llmReturns({
      reply: "What should we call it?",
      ready: true, // model wrongly claims ready
      blueprint: {
        name: "", // invalid → not ready
        description: "d",
        persona: "p",
        first_message: "hi",
        model: "claude-sonnet-4-6",
        skills: [],
        tools: [],
      },
    });

    const result = await runArchitectTurn({
      transcript: [{ role: "user", content: "make an agent" }],
      workspaceId: "ws-1",
    });

    expect(result.ready).toBe(false);
    expect(result.blueprintErrors.join(" ")).toMatch(/name/i);
  });

  it("degrades gracefully when the model returns non-JSON", async () => {
    mockComplete.mockResolvedValueOnce({
      message: { role: "assistant", content: "sorry, I'm confused" },
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      raw: {},
    } as never);

    const result = await runArchitectTurn({
      transcript: [{ role: "user", content: "hi" }],
      workspaceId: "ws-1",
    });

    expect(result.ready).toBe(false);
    expect(result.reply.length).toBeGreaterThan(0);
    // A fully-typed (empty) blueprint is still returned.
    expect(Array.isArray(result.blueprint.tools)).toBe(true);
  });

  it("passes json_object response format and a workspace-scoped feature tag", async () => {
    llmReturns({ reply: "ok", ready: false, blueprint: {} });
    await runArchitectTurn({
      transcript: [{ role: "user", content: "hi" }],
      workspaceId: "ws-42",
    });
    const opts = mockComplete.mock.calls[0][0];
    expect(opts.responseFormat).toEqual({ type: "json_object" });
    expect(opts.feature).toBe("agent.architect");
    expect(opts.workspaceId).toBe("ws-42");
    // System prompt is prepended.
    expect(opts.messages[0].role).toBe("system");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/dante/agent-architect.test.ts
```

Expected: FAIL — `Cannot find module './agent-architect'`.

- [ ] **Step 3: Create `lib/dante/agent-architect.ts`**

```ts
// lib/dante/agent-architect.ts
//
// The "Build by Chatting" engine. Given a conversation transcript, it
// asks the LLM to (a) reply conversationally and (b) emit its best
// current AgentBlueprint as JSON. Each turn is stateless: the caller
// owns the transcript, so the same input reproduces the same output
// (modulo model sampling). The blueprint is always re-validated here —
// the model's own `ready` claim is never trusted over validation.

import { complete } from "@/lib/llm/client";
import { GENERIC_SKILLS, GENERIC_TOOLS } from "./agent-catalog";
import {
  DEFAULT_AGENT_MODEL,
  validateBlueprint,
  type AgentBlueprint,
} from "./agent-blueprint";

export interface ArchitectMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunArchitectTurnInput {
  transcript: ArchitectMessage[];
  workspaceId: string;
}

export interface ArchitectTurnResult {
  reply: string;
  blueprint: AgentBlueprint;
  blueprintErrors: string[];
  ready: boolean;
}

function catalogForPrompt(): string {
  const tools = GENERIC_TOOLS.map((t) => `  - ${t.id}: ${t.description}`).join("\n");
  const skills = GENERIC_SKILLS.map((s) => `  - ${s.slug}: ${s.description}`).join("\n");
  return `AVAILABLE TOOLS (suggest only ids from this list):\n${tools}\n\nAVAILABLE SKILLS (suggest only slugs from this list):\n${skills}`;
}

const SYSTEM_PROMPT = `You are the Agent Architect inside Dante, a platform where anyone builds AI agents for their business without code. Your job: interview the user briefly and design their agent.

On EVERY turn you output ONLY a single JSON object, no prose outside it, with this exact shape:
{
  "reply": "a short, friendly message to show the user — acknowledge what you learned and, if anything essential is missing, ask ONE clarifying question",
  "ready": true | false,
  "blueprint": {
    "name": "short agent name",
    "description": "one sentence on what the agent does",
    "persona": "the agent's full system prompt — identity, tone, boundaries, and escalation rules, written in the second person ('You are...')",
    "first_message": "the agent's opening greeting to an end user",
    "model": "claude-haiku-4-5 | claude-sonnet-4-6 | claude-opus-4-7",
    "skills": ["skill_slug", ...],
    "tools": ["tool.id", ...]
  }
}

Rules:
- Always return your best CURRENT blueprint, even if partial. Improve it each turn as you learn more.
- Set "ready" to true only when name and persona are solid and you have nothing essential left to ask.
- Suggest tools and skills ONLY from the catalog below. Never invent ids.
- Default the model to claude-sonnet-4-6 unless the task is trivial (haiku) or demands deep reasoning (opus).
- Keep "reply" to 1-3 sentences. Ask at most ONE question per turn.

${catalogForPrompt()}`;

function safeParse(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function runArchitectTurn(
  input: RunArchitectTurnInput,
): Promise<ArchitectTurnResult> {
  const result = await complete({
    model: DEFAULT_AGENT_MODEL,
    temperature: 0.4,
    responseFormat: { type: "json_object" },
    feature: "agent.architect",
    workspaceId: input.workspaceId,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...input.transcript.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  const content = typeof result.message.content === "string" ? result.message.content : "";
  const parsed = safeParse(content);

  if (!parsed) {
    // Model didn't emit JSON. Show its text (or a fallback) and keep going.
    const { blueprint } = validateBlueprint({});
    return {
      reply:
        content.trim() ||
        "Sorry, I didn't catch that. Can you describe what you want your agent to do?",
      blueprint,
      blueprintErrors: ["Agent needs a name.", "Agent needs a persona (system prompt)."],
      ready: false,
    };
  }

  const { ok, blueprint, errors } = validateBlueprint(parsed.blueprint);
  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : "Tell me more about what this agent should do.";
  const modelReady = parsed.ready === true;

  return {
    reply,
    blueprint,
    blueprintErrors: errors,
    // Never let the model claim ready over a failing validation.
    ready: modelReady && ok,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/dante/agent-architect.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dante/agent-architect.ts lib/dante/agent-architect.test.ts
git commit -m "feat: agent architect turn engine (NL description -> validated blueprint)"
```

---

### Task 4: Migration — `agents.builder_config` column

**Files:**
- Create: `supabase/migrations/20260703000000_add_agents_builder_config.sql`
- Modify: `scripts/check-schema.ts`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260703000000_add_agents_builder_config.sql`:

```sql
-- Agent Builder — store the architect's selected skills/tools alongside
-- the agent. Persona/greeting/model already live in dedicated columns
-- (llm_instructions, first_message, llm_model); this jsonb holds the
-- rest of the blueprint the conversational builder produced.
--
-- Shape: { "skills": string[], "tools": string[], "source": "architect" }
--
-- NOTE: this is persisted config, not a runtime enforcement boundary.
-- Making the agent loop honor a per-agent tool allowlist is a follow-up.

alter table public.agents
  add column if not exists builder_config jsonb;
```

- [ ] **Step 2: Add `builder_config` to the schema manifest**

In `scripts/check-schema.ts`, find the `MANIFEST` entry for the `agents` table. If one exists, add `"builder_config"` to its `columns` array. If no `agents` entry exists, add one:

```ts
  { table: "agents", columns: ["id", "workspace_id", "name", "status", "llm_instructions", "first_message", "llm_model", "builder_config"] },
```

(Match the surrounding array/object style exactly — insert as a new element in the `MANIFEST` array.)

- [ ] **Step 3: Typecheck the script**

```bash
npx tsc --noEmit 2>&1 | grep check-schema; echo "grep exit: $? (1 = clean)"
```

Expected: no matches (`grep exit: 1`).

- [ ] **Step 4: Apply the migration to your Supabase (manual, environment-dependent)**

If a Supabase CLI is linked:

```bash
supabase db push 2>&1 | tail -5 || echo "Apply 20260703000000_add_agents_builder_config.sql via your migration process"
```

Expected: migration applies, or a clear note to apply it through the project's normal migration path. Do not block the plan on live DB access — the column is `add ... if not exists` and safe to re-run.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260703000000_add_agents_builder_config.sql scripts/check-schema.ts
git commit -m "feat: agents.builder_config column for architect-selected skills/tools"
```

---

### Task 5: Architect API route

**Files:**
- Create: `app/api/agents/architect/route.ts`

This route is a thin auth+rate-limit wrapper over `runArchitectTurn`. It has no unit test (it's I/O glue over the tested engine); it's exercised by the UI in Task 7. Follow the exact auth pattern from `app/api/agents/route.ts`.

- [ ] **Step 1: Create the route**

Create `app/api/agents/architect/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { runArchitectTurn, type ArchitectMessage } from "@/lib/dante/agent-architect";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.workspace_id ?? null;
}

function sanitizeTranscript(raw: unknown): ArchitectMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ArchitectMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    out.push({ role, content: content.slice(0, 4000) });
  }
  if (out.length === 0 || out.length > 40) return null;
  return out;
}

export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`agent-architect:${workspaceId}`, 30);
  if (!rl.allowed) return rateLimitResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const transcript = sanitizeTranscript((body as { transcript?: unknown })?.transcript);
  if (!transcript) {
    return NextResponse.json({ error: "transcript must be a non-empty array of {role, content}" }, { status: 400 });
  }

  try {
    const result = await runArchitectTurn({ transcript, workspaceId });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[agent-architect] turn failed:", err);
    return NextResponse.json({ error: "Architect failed to respond" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "architect/route"; echo "grep exit: $? (1 = clean)"
```

Expected: no matches (`grep exit: 1`).

- [ ] **Step 3: Commit**

```bash
git add app/api/agents/architect/route.ts
git commit -m "feat: POST /api/agents/architect turn endpoint"
```

---

### Task 6: Create-from-blueprint API route

**Files:**
- Create: `app/api/agents/from-blueprint/route.ts`

Creates an `agents` row from a validated blueprint and returns `{ id }`. Re-validates server-side (never trust the client). Chat modality, draft status.

- [ ] **Step 1: Create the route**

Create `app/api/agents/from-blueprint/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { validateBlueprint } from "@/lib/dante/agent-blueprint";

export const dynamic = "force-dynamic";

async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.workspace_id ?? null;
}

export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`agents:${workspaceId}`, 60);
  if (!rl.allowed) return rateLimitResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ok, blueprint, errors } = validateBlueprint((body as { blueprint?: unknown })?.blueprint);
  if (!ok) {
    return NextResponse.json({ error: "Incomplete agent", details: errors }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("agents")
    .insert({
      workspace_id: workspaceId,
      name: blueprint.name,
      description: blueprint.description || null,
      modality: "chat",
      status: "draft",
      mode: "llm",
      llm_instructions: blueprint.persona,
      first_message: blueprint.first_message || null,
      llm_model: blueprint.model,
      // Persisted config (skills + tools). Not a runtime enforcement
      // boundary yet — see migration note.
      builder_config: {
        skills: blueprint.skills,
        tools: blueprint.tools,
        source: "architect",
      },
    })
    .select("id")
    .single();

  if (error) {
    console.error("[from-blueprint] insert failed:", error);
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "from-blueprint"; echo "grep exit: $? (1 = clean)"
```

Expected: no matches (`grep exit: 1`).

- [ ] **Step 3: Commit**

```bash
git add app/api/agents/from-blueprint/route.ts
git commit -m "feat: POST /api/agents/from-blueprint creates a chat agent from a blueprint"
```

---

### Task 7: The `/agent/new` conversational builder UI

**Files:**
- Create: `app/agent/new/page.tsx`
- Create: `app/agent/new/AgentArchitectClient.tsx`

Follows the pattern of `app/agent/page.tsx` (server page → AppShell → client). The client is a split view: chat thread on the left, live blueprint preview + "Create agent" on the right.

- [ ] **Step 1: Create the server page**

Create `app/agent/new/page.tsx`:

```tsx
// app/agent/new/page.tsx
//
// Conversational agent builder ("Build by Chatting"). Server page
// mirrors app/agent/page.tsx: fetch workspace context, mount the
// client under AppShell.

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import AgentArchitectClient from "./AgentArchitectClient";

export const metadata: Metadata = {
  title: "Build an agent — Dante",
  description: "Describe what you want and Dante builds the agent with you.",
};

export const dynamic = "force-dynamic";

export default async function NewAgentPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  return (
    <AppShell {...ctx}>
      <AgentArchitectClient />
    </AppShell>
  );
}
```

- [ ] **Step 2: Create the client**

Create `app/agent/new/AgentArchitectClient.tsx`:

```tsx
"use client";

// The "Build by Chatting" surface. Left: a chat with the Agent
// Architect. Right: a live preview of the blueprint it's assembling.
// When the architect marks the design ready (and the user is happy),
// "Create agent" POSTs the blueprint and redirects to the full editor.

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send, Loader2, Sparkles, Wrench, Puzzle } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface Blueprint {
  name: string;
  description: string;
  persona: string;
  first_message: string;
  model: string;
  skills: string[];
  tools: string[];
}

const EMPTY_BLUEPRINT: Blueprint = {
  name: "",
  description: "",
  persona: "",
  first_message: "",
  model: "claude-sonnet-4-6",
  skills: [],
  tools: [],
};

const GREETING =
  "Hi — I'm the Agent Architect. Describe the agent you want (what it does, who it talks to, what it should and shouldn't do) and I'll build it with you.";

export default function AgentArchitectClient() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [blueprint, setBlueprint] = useState<Blueprint>(EMPTY_BLUEPRINT);
  const [ready, setReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, thinking]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setError(null);
    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setThinking(true);
    try {
      // Send the transcript WITHOUT the local greeting (it's UI-only).
      const transcript = nextMessages.filter(
        (m, i) => !(i === 0 && m.role === "assistant" && m.content === GREETING),
      );
      const res = await fetch("/api/agents/architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Architect failed");
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setBlueprint(data.blueprint);
      setReady(Boolean(data.ready));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setThinking(false);
    }
  }, [input, thinking, messages]);

  const create = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/from-blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprint }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.details?.join(" ") || body?.error || "Could not create agent");
      }
      const { id } = await res.json();
      router.push(`/agent/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create agent");
      setCreating(false);
    }
  }, [blueprint, creating, router]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/agent" className="inline-flex items-center gap-1 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">
        <ArrowLeft className="h-4 w-4" /> Agents
      </Link>

      <h1 className="heading-display mt-3 text-3xl">Build an agent</h1>
      <p className="mt-1 text-[var(--ink-muted)]">
        Describe what you want. Dante designs it with you.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Chat column */}
        <div className="flex flex-col rounded-xl border border-[var(--rule)] bg-[var(--canvas)]">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "60vh" }}>
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-[var(--canvas)]"
                    : "mr-auto max-w-[85%] rounded-lg bg-[var(--canvas-subtle)] px-3 py-2 text-sm"
                }
              >
                {m.content}
              </div>
            ))}
            {thinking && (
              <div className="mr-auto flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Designing…
              </div>
            )}
          </div>
          <div className="border-t border-[var(--rule)] p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder="e.g. A support agent for my plumbing company that can book appointments…"
                className="flex-1 resize-none rounded-lg border border-[var(--rule)] bg-transparent px-3 py-2 text-sm focus:outline-none"
              />
              <button
                onClick={send}
                disabled={thinking || !input.trim()}
                className="inline-flex h-10 items-center gap-1 rounded-lg bg-[var(--ink)] px-3 text-sm text-[var(--canvas)] disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Preview column */}
        <div className="rounded-xl border border-[var(--rule)] bg-[var(--canvas)] p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4" /> Live preview
          </div>

          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-[var(--ink-muted)]">Name</dt>
              <dd className="mt-0.5 font-medium">{blueprint.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-muted)]">Description</dt>
              <dd className="mt-0.5">{blueprint.description || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-muted)]">Greeting</dt>
              <dd className="mt-0.5">{blueprint.first_message || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-muted)]">Model</dt>
              <dd className="mt-0.5 font-mono text-xs">{blueprint.model}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-muted)]">Persona</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-[var(--ink-muted)]" style={{ maxHeight: "10rem", overflowY: "auto" }}>
                {blueprint.persona || "—"}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[var(--ink-muted)]"><Puzzle className="h-3.5 w-3.5" /> Skills</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {blueprint.skills.length === 0 ? "—" : blueprint.skills.map((s) => (
                  <span key={s} className="rounded-full border border-[var(--rule)] px-2 py-0.5 text-xs">{s}</span>
                ))}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[var(--ink-muted)]"><Wrench className="h-3.5 w-3.5" /> Tools</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {blueprint.tools.length === 0 ? "—" : blueprint.tools.map((t) => (
                  <span key={t} className="rounded-full border border-[var(--rule)] px-2 py-0.5 font-mono text-xs">{t}</span>
                ))}
              </dd>
            </div>
          </dl>

          {error && <p className="mt-4 text-sm text-[var(--flag)]">{error}</p>}

          <button
            onClick={create}
            disabled={!ready || creating}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm text-[var(--canvas)] disabled:opacity-40"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {ready ? "Create agent" : "Keep describing to finish"}
          </button>
          <p className="mt-2 text-center text-xs text-[var(--ink-muted)]">
            You can fine-tune everything in the editor after creating.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "agent/new"; echo "grep exit: $? (1 = clean)"
```

Expected: no matches (`grep exit: 1`).

- [ ] **Step 4: Verify the imports resolve (getShellContext, AppShell)**

```bash
test -f lib/shell/workspace-context.ts && grep -q "getShellContext" lib/shell/workspace-context.ts && echo "getShellContext OK"
test -f components/shell/AppShell.tsx && echo "AppShell OK"
```

Expected: both `OK`. If `getShellContext` lives elsewhere, match the import used by `app/agent/page.tsx` (copy its import lines verbatim).

- [ ] **Step 5: Commit**

```bash
git add app/agent/new/page.tsx app/agent/new/AgentArchitectClient.tsx
git commit -m "feat: /agent/new conversational agent builder UI"
```

---

### Task 8: Roster entry point

**Files:**
- Modify: `app/agent/AgentRosterClient.tsx`

Add a primary "Build by chatting" action that links to `/agent/new`, alongside the existing "New agent" modal.

- [ ] **Step 1: Locate the roster header actions**

```bash
grep -n "New agent\|Plus\|setShowCreate\|onClick" app/agent/AgentRosterClient.tsx | head -20
```

Identify the header region where the existing create button/modal trigger lives.

- [ ] **Step 2: Add the link**

`Link` is already imported in this file. Next to the existing "New agent" button, add:

```tsx
<Link
  href="/agent/new"
  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-[var(--canvas)]"
>
  <Sparkles className="h-4 w-4" />
  Build by chatting
</Link>
```

(`Sparkles` is already imported in this file per its import block. If lint reports it unused elsewhere, this use resolves it.)

- [ ] **Step 3: Typecheck + lint the file**

```bash
npx tsc --noEmit 2>&1 | grep "AgentRosterClient"; echo "grep exit: $? (1 = clean)"
```

Expected: no matches (`grep exit: 1`).

- [ ] **Step 4: Commit**

```bash
git add app/agent/AgentRosterClient.tsx
git commit -m "feat: 'Build by chatting' entry point on the agent roster"
```

---

### Task 9: Verification sweep

**Files:** none modified (fixes only if regressions surface).

- [ ] **Step 1: Full unit suite**

```bash
npm test 2>&1 | tail -6
```

Expected: baseline 300 + 19 new (6 catalog + 8 blueprint + 5 architect) = 319 passing, no failures.

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit 2>&1 | tail -3; echo "tsc exit: $?"
npm run lint 2>&1 | tail -4
```

Expected: tsc exit 0; lint shows no *new* errors vs. the Task 0 baseline (the repo has pre-existing lint errors — compare counts, don't require zero).

- [ ] **Step 3: Production build sanity (routes compile)**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds and the route list includes `/agent/new`, `/api/agents/architect`, and `/api/agents/from-blueprint`. If the build fails for a reason unrelated to this plan (pre-existing), note it and continue.

- [ ] **Step 4: Manual smoke (requires a running dev server + DB)**

```bash
npm run dev
```

Then in the browser: `/agent` → "Build by chatting" → describe "a support agent for my plumbing company that can book appointments and answer service questions" → confirm the architect replies, the preview fills in (name, persona, a couple of generic tools/skills), the "Create agent" button enables when it says it's ready, and clicking it lands on `/agent/[id]` with the persona populated. If no DB/LLM keys are configured locally, note that this step is deferred to a staging environment.

- [ ] **Step 5: Finish**

Use superpowers:finishing-a-development-branch to verify tests and choose merge/PR handling.

---

## Self-Review

**Spec coverage (§1.1 Conversational Agent Creation):**
- "Natural language setup" → Task 3 architect + Task 7 chat UI. ✓
- "Dante generates a complete agent configuration (persona, tool bindings, knowledge schema, suggested workflow triggers, channel recommendations)" → blueprint covers persona/first_message/model/skills/tools; knowledge-schema + workflow-trigger + channel suggestions are noted as later-plan surface (§2/§3/§4 deferred). Partial-by-design; the *created agent config* is complete and deployable. ✓ (bounded)
- "Guided refinement — Dante asks clarifying questions and updates the config in real time" → architect returns one question per turn + an updated blueprint each turn; UI re-renders the preview. ✓
- "One-click deploy … shareable chat widget" → creation lands in the existing editor where deploy = status flip; the *widget/channel* surface is the deferred §4 plan. The create→editor→deploy path works; widget embedding is explicitly out of scope. ✓ (bounded)

**Placeholder scan:** No "TBD"/"handle errors"/"similar to". Every code step has full code. ✓

**Type consistency:** `AgentBlueprint` fields (`name`, `description`, `persona`, `first_message`, `model`, `skills`, `tools`) are identical across `agent-blueprint.ts`, the architect result, the from-blueprint route insert, and the UI `Blueprint` interface. `runArchitectTurn` returns `{ reply, blueprint, blueprintErrors, ready }` — matched in the architect test and the UI's use of `data.reply`/`data.blueprint`/`data.ready`. Catalog helpers `filterKnownTools`/`filterKnownSkills`/`isKnownTool`/`isKnownSkill` are named identically in definition, tests, and consumers. ✓

**Deferred items are labeled, not dropped:** eval/A-B/replay/grounding dashboard (§1.4), guardrail enforcement (§1.2), per-agent runtime tool enforcement, memory-tier UI, and channels (§4) are each named in Scope Boundaries so a later plan picks them up. ✓
