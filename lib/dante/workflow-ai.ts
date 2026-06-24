// lib/dante/workflow-ai.ts
//
// "Generate with Dante" — natural-language → workflow graph.
//
// Pipeline:
//   1. Send the user prompt to GPT-4o with a detailed system prompt
//      that enumerates every node type, its config schema, and the
//      templating rules.
//   2. Ask for a JSON object via `response_format: json_object`.
//   3. Validate + normalize the response into a WorkflowGraph the
//      editor / runner can use immediately.
//   4. Auto-layout: snap the nodes to a vertical column if the model
//      returns silly positions (or none at all), so the canvas isn't
//      a jumbled pile on first open.
//
// The model writes the high-level shape; the human tweaks from there.
// Never trust the output blindly — validate() throws on anything we
// can't run.

import type {
  GraphEdge,
  GraphNode,
  StepType,
  WorkflowGraph,
  WorkflowStep,
} from "./workflow-types";
import type { BookSummary } from "./book-summary";
import { renderBookSummaryText } from "./book-summary";
import type { WorkflowProposal } from "./workflow-proposals";
import { complete as llmComplete } from "@/lib/llm/client";

export interface GeneratedWorkflow {
  name: string;
  description: string;
  graph: WorkflowGraph;
  /** Quality warnings from post-generation checks.
   *  Present only when the generator auto-fixed model mistakes
   *  (dangling nodes, missing configs, unreachable subgraphs). */
  _warnings?: string[];
}

// ── Prompt ────────────────────────────────────────────────────
// Keep this verbose on purpose — the model needs full config shapes
// per node type plus the templating convention to emit something the
// runner can actually execute.

const SYSTEM_PROMPT = `
You are Dante, a workflow architect for a CRM called Drift used by
commercial real estate brokers and developers. You translate a user's
natural-language request into a Drift workflow graph. You output ONLY a
single JSON object, no prose, with this exact shape:

{
  "name": "short human title (under 60 chars)",
  "description": "one-sentence description",
  "graph": {
    "nodes": [ { "id": "...", "type": "...", "position": {"x":0,"y":0}, "data": { "step": { ... } } }, ... ],
    "edges": [ { "id": "...", "source": "...", "target": "...", "sourceHandle": "true"|"false"|null }, ... ]
  }
}

RULES

1. Every graph starts with exactly ONE trigger node. Choose based on
   user intent:
     - "trigger_manual"   -> user clicks Run
     - "trigger_cron"     -> time-based. config.cron is a 5-field crontab.
     - "trigger_webhook"  -> external POST fires the run.
     - "trigger_at"       -> one-shot at a specific time. config: { "scheduled_for": "2026-06-01T09:00:00Z", "timezone": "America/New_York" }
       Fires once, then disarms. Use for "remind me at X" or one-time scheduled tasks.
   The trigger node's step object looks like:
     { "id": "trigger", "type": "trigger_manual", "name": "Manual trigger", "config": {} }
   or for cron:
     { "id": "trigger", "type": "trigger_cron", "name": "Every day 9am", "config": { "cron": "0 9 * * *" } }

2. Node types and their config schema:

   - "http":
     config: { "url": "https://...", "method": "GET"|"POST"|"PUT"|"PATCH"|"DELETE",
               "headers": {...}, "body": {...} }

   - "openai" (chat completion -> emits { text }):
     config: { "model": "gpt-4.1", "system": "...", "prompt": "...", "max_completion_tokens": 800 }

   - "query_clients" (Supabase select on contacts table -> emits { contacts: [...], count }):
     config: { "filter": { "column": "value" }, "limit": 25 }
     Available columns: id, name, email, phone, created_at.
     Filter values support operator prefixes for range queries:
       "gte:value", "lte:value", "gt:value", "lt:value",
       "neq:value", "ilike:%value%". No prefix = exact equality.
     Date math: {{now}}, {{now - 24h}}, {{now - 7d}}, {{now - 2w}}, {{now - 1m}}.

   - "query_properties" (Supabase select on properties -> emits { properties: [...], count }):
     config: { "filter": { "column": "value" }, "limit": 25 }
     Available columns: id, name, address, city, state, zip,
       transaction_stage, stage_entered_at, expected_close_date,
       lease_end_date, monthly_rent_cents, tenant_contact_id,
       year_built, lot_size_sqft.
     Same operator prefixes as query_clients. Pipeline stages:
       prospecting, showing, under_contract, due_diligence, closing, closed, listed, off_market.
     Example: properties with leases expiring in next 90 days:
       { "filter": { "lease_end_date": "lte:{{now + 90d}}" }, "limit": 50 }

   - "lease_lookup" (query lease_abstracts -> emits { abstracts: [...], count, terms }):
     config: { "status": "completed"|"pending"|"processing", "limit": 10 }
     Returns abstracted lease terms (base rent, escalation,
     expiration, key clauses) from the lease abstraction pipeline.

   - "agent" (autonomous LLM loop with tool access -> emits { text, tool_calls }):
     config: {
       "objective": "Describe the task. Reference prior step output with {{steps.<id>.<field>}}.",
       "tools": ["site_scan.void_analysis", "site_scan.search", "site_scan.detail", "memory.write"],
       "max_steps": 10
     }
     Available agent tools:
       - site_scan.void_analysis: corridor analysis with 2-8 anchor points, scores parcels 0-7
       - site_scan.search: parcel search by location/zoning/acreage (5-mile radius)
       - site_scan.detail: full auditor + tax + census + EPA data per parcel
       - memory.write: save findings to workspace memory for future reference
       - memory.search: search workspace memory
       - clients.query: query contacts
       - web.search: search the web for market intel, news, listings, regulations
     Use agent nodes for outbound intelligence workflows: void analysis,
     site prospecting, parcel deep-dives, environmental scanning. Agent
     nodes are heavyweight (multi-step LLM loops) so use them only when
     the task genuinely requires tool use and autonomous reasoning.

   - "web_search" (Tavily web search -> emits { answer, results, count, query, source_tier }):
     config: { "query": "...", "max_results": 5, "search_depth": "basic"|"advanced",
       "include_domains": ["loopnet.com"], "exclude_domains": [] }
     Returns an AI-generated answer and individual result URLs with snippets.
     source_tier is { tier: 3, source: "Web search (Tavily)" } -- Tier 3 (web/news).
     Use for market research, comp searches, zoning lookups, news monitoring,
     or any question that benefits from current web data. Supports templates
     in the query field. The agent node also has "web.search" as a tool.

   - "update_contact" (patch one contact):
     config: { "contact_id": "uuid or template", "patch": { ... } }

   - "send_email" (Resend):
     config: { "to": "...", "subject": "...", "html": "...", "text": "..." }

   - "send_sms" (iMessage / SMS):
     config (exactly ONE recipient selector):
       { "to_phone": "+15551234567", "body": "..." }
       { "to_role": "owner"|"admin"|"member"|"all", "body": "..." }
       { "to_member_id": "<profile uuid>", "body": "..." }

   - "condition" (emits "true" or "false" handle):
     config: { "expression": "{{steps.x.text}} contains 'yes'", "on_false": "stop"|"continue" }
     Supported operators: "contains", "==", "!=", ">", "<", ">=", "<=".

   - "delay":
     config: { "seconds": 5 }  // max 60s

   - "archive_lookup" (vector-search the firm's document archive -> emits { hits, context, citations }):
     config: { "query": "...", "k": 5, "kind": "lease"|"policy"|"memo"|"comp"|"inspection"|"disclosure"|"deed"|"insurance"|"regulation"|"other" }

   - "integration_query" (query a connected integration -> emits { status, ok, body, provider, source_tier }):
     config: { "provider": "costar", "endpoint": "https://api.costar.com/v1/...", "method": "GET"|"POST"|"PUT"|"DELETE",
               "params": {...}, "headers": {...} }
     Credentials (API key) are loaded automatically from Settings > Integrations.
     source_tier is { tier: 2, source: "<provider> API" } -- Tier 2 (commercial data).


   - "generate_document" (branded PDF report -> emits { url, size_bytes, filename }):
     config: { "title": "...", "subtitle": "...", "sections": [{"heading": "...", "body": "..."}] }
     Uses workspace branding (logo, colors). PDF is uploaded to vault with a 24h signed URL.

   - "for_each" (iterate over array, apply action per item -> emits { results, total, succeeded, failed }):
     config: { "items": "{{steps.query.contacts}}", "action_type": "send_email"|"update_contact"|"http"|"send_sms"|"generate_document"|"integration_query",
               "action_config": { "to": "{{item.email}}", "subject": "...", "text": "..." } }
     Use {{item.<field>}} in action_config to reference the current item.

   - "approval" (pause for human approve/reject -> emits { approved, action, reason }):
     config: { "approver_role": "owner"|"admin"|"any", "message": "Please review...", "timeout_hours": 72 }
     Pauses the workflow run and emails the approver with magic links.
     Downstream nodes can branch on {{steps.<id>.approved}} (true/false).

   - "transform" (reshape data between steps -> emits fields you define):
     config: { "operations": [
       {"action": "set", "field": "full_address", "value": "{{steps.trigger.input.street}}, {{steps.trigger.input.city}}"},
       {"action": "rename", "field": "contact_name", "from": "query.contacts.0.name"},
       {"action": "delete", "field": "temp"},
       {"action": "expression", "field": "parsed", "value": "{\"key\": \"val\"}"}
     ] }
     Use to reshape data between steps. Output fields become {{steps.<id>.<field>}}.

   - "switch" (multi-way branch with N output handles + default):
     config: { "expression": "{{steps.classify.text}}", "cases": [
       {"value": "high", "label": "High priority"},
       {"value": "medium", "label": "Medium"},
       {"value": "low", "label": "Low"}
     ], "default_case": "__default__" }
     Like condition but with 3+ branches. Each case has a sourceHandle matching its value.
     Edges leaving a switch node MUST set sourceHandle to a case value or "__default__".

   - "sub_workflow" (run another workflow as a nested step -> emits { status, output, log_entries }):
     config: { "workflow_id": "uuid-of-another-workflow", "input": {"key": "{{steps.trigger.input.val}}"} }
     Runs the referenced workflow synchronously. The sub-workflow's full output is available
     at {{steps.<id>.output}}. Use for composition -- break complex logic into reusable pieces.

3. Trigger types also include:
   - "trigger_lease_expiry": fires when leases are within N days of expiration.
     config: { "days_before": 90 }. Checked daily. Input includes { properties: [...] }.
   - "trigger_deal_stage": fires when a property's pipeline stage changes.
     config: { "from_stage": "listed"|""|null, "to_stage": "pending"|""|null }
     Empty/null means "any". Input includes { property_id, from_stage, to_stage, address }.

4. IDs are short snake_case unique strings, e.g. "classify", "send_alert".
   Node id, data.step.id, and edge ids must all match up.

5. Edges connect nodes. Use sourceHandle on edges that leave a
   condition node ("true" / "false") or a switch node (case value or
   "__default__"). Every other edge omits sourceHandle (or sets null).

6. Templating: any config string can reference a prior node's output
   with {{steps.<node_id>.<path>}}. The trigger exposes the run input
   at {{steps.<trigger_id>.input.<field>}}.
   Secrets: {{secrets.<key>}} for API keys, broker email, tokens.
   Date math: {{now}}, {{now - 24h}}, {{now - 7d}}, {{now - 2w}}, {{now - 1m}}.

7. Positions: trigger at {x:80,y:80}, then each downstream node 160px
   below. Branching conditions can spread left/right (x +/- 240).

8. Prefer small graphs. 3-6 nodes is typical. For outbound intelligence
   (void analysis, site selection, parcel research), use an agent node
   rather than chaining many individual steps.

9. Cron scheduling: cron fires at most ONCE per day on this platform.
   If the user asks for sub-daily frequency, set a sensible daily time
   and mention the limitation in the description.

10. Never invent node types. Stick to the list above.

OUTPUT ONLY THE JSON OBJECT.
`.trim();

// ── Validation ────────────────────────────────────────────────
// Strict enough to keep bad output out of the DB, lenient enough that
// a close-but-not-perfect model response still runs. Anything missing
// a required field throws and the API route returns a 422.

const VALID_STEP_TYPES: StepType[] = [
  "trigger_manual", "trigger_cron", "trigger_webhook", "trigger_at",
  "trigger_lease_expiry", "trigger_deal_stage",
  "http", "openai", "query_clients", "update_contact",
  "send_email", "send_sms", "condition", "delay", "archive_lookup",
  "agent", "query_properties", "lease_lookup",
  "web_search",
  "integration_query", "generate_document", "for_each",
  "transform", "switch", "sub_workflow",
  "approval",
];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validate(raw: unknown): GeneratedWorkflow {
  if (!isObj(raw)) throw new Error("Generator did not return an object");
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (!name) throw new Error("Generator response missing `name`");

  const g = raw.graph;
  if (!isObj(g)) throw new Error("Generator response missing `graph`");

  const nodesIn = Array.isArray(g.nodes) ? g.nodes : [];
  const edgesIn = Array.isArray(g.edges) ? g.edges : [];
  if (nodesIn.length === 0) throw new Error("Graph must have at least one node");

  const nodes: GraphNode[] = [];
  const seenIds = new Set<string>();
  let triggerCount = 0;

  nodesIn.forEach((n, i) => {
    if (!isObj(n)) throw new Error(`Node #${i} is not an object`);
    const id = typeof n.id === "string" ? n.id : "";
    const type = n.type as StepType;
    if (!id) throw new Error(`Node #${i} has no id`);
    if (seenIds.has(id)) throw new Error(`Duplicate node id: ${id}`);
    seenIds.add(id);
    if (!VALID_STEP_TYPES.includes(type)) {
      throw new Error(`Node ${id} has unknown type: ${String(n.type)}`);
    }
    if (type.startsWith("trigger_")) triggerCount++;

    const data = isObj(n.data) ? n.data : {};
    const stepRaw = isObj(data.step) ? data.step : {};
    const step: WorkflowStep = {
      id,
      type,
      name: typeof stepRaw.name === "string" ? stepRaw.name : humanize(type),
      config: (isObj(stepRaw.config) ? stepRaw.config : {}) as WorkflowStep["config"],
      on_error: (stepRaw.on_error === "continue" ? "continue" : "stop"),
    } as WorkflowStep;

    const pos = isObj(n.position) ? n.position : {};
    const x = typeof pos.x === "number" ? pos.x : 80;
    const y = typeof pos.y === "number" ? pos.y : 80 + i * 140;

    nodes.push({ id, type, position: { x, y }, data: { step } });
  });

  if (triggerCount === 0) throw new Error("Graph has no trigger node");
  if (triggerCount > 1)  throw new Error("Graph has more than one trigger node");

  const edges: GraphEdge[] = edgesIn.map((e, i) => {
    if (!isObj(e)) throw new Error(`Edge #${i} is not an object`);
    const source = typeof e.source === "string" ? e.source : "";
    const target = typeof e.target === "string" ? e.target : "";
    if (!seenIds.has(source)) throw new Error(`Edge ${i} references unknown source: ${source}`);
    if (!seenIds.has(target)) throw new Error(`Edge ${i} references unknown target: ${target}`);
    const sourceHandle = e.sourceHandle === "true" || e.sourceHandle === "false"
      ? e.sourceHandle : undefined;
    const id = typeof e.id === "string" && e.id
      ? e.id
      : `${source}->${target}${sourceHandle ? `:${sourceHandle}` : ""}`;
    return { id, source, target, sourceHandle };
  });

  const conditionIds = new Set(nodes.filter((n) => n.type === "condition").map((n) => n.id));
  for (const e of edges) {
    if (conditionIds.has(e.source) && !e.sourceHandle) {
      e.sourceHandle = "true";
    }
  }

  // Auto-layout: if every node has the same x AND y (model punted), or
  // positions overlap, lay them out as a vertical column.
  const positions = new Set(nodes.map((n) => `${n.position.x},${n.position.y}`));
  if (positions.size < nodes.length) {
    nodes.forEach((n, i) => { n.position = { x: 80, y: 80 + i * 140 }; });
  }

  // ── Post-generation quality checks ────────────────────────────
  // These don't throw — they fix common model mistakes automatically.
  const warnings: string[] = [];

  // 1. Dangling nodes: any node not referenced by edges (except trigger)
  const triggerNode = nodes.find((n) => n.type.startsWith("trigger_"));
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }
  if (triggerNode) connectedIds.add(triggerNode.id);
  const dangling = nodes.filter((n) => !connectedIds.has(n.id));
  if (dangling.length > 0 && triggerNode) {
    // Auto-wire dangling nodes to the end of the chain
    const lastTarget = edges.length > 0
      ? edges[edges.length - 1].target
      : triggerNode.id;
    for (const d of dangling) {
      edges.push({
        id: `${lastTarget}->${d.id}`,
        source: lastTarget,
        target: d.id,
      });
      warnings.push(`Auto-wired dangling node "${d.id}" after "${lastTarget}"`);
    }
  }

  // 2. Missing required configs — agent nodes need an objective
  for (const n of nodes) {
    if (n.type === "agent") {
      const cfg = n.data.step.config as Record<string, unknown>;
      if (!cfg.objective && cfg.prompt) {
        cfg.objective = cfg.prompt as string;
        warnings.push(`Copied agent node "${n.id}" prompt to objective field`);
      }
    }
    // openai nodes need a prompt
    if (n.type === "openai") {
      const cfg = n.data.step.config as Record<string, unknown>;
      if (!cfg.prompt && cfg.objective) {
        cfg.prompt = cfg.objective as string;
        warnings.push(`Copied openai node "${n.id}" objective to prompt field`);
      }
    }
    // send_email nodes need a "to" field
    if (n.type === "send_email") {
      const cfg = n.data.step.config as Record<string, unknown>;
      if (!cfg.to) {
        cfg.to = "{{owner_email}}";
        warnings.push(`Set default recipient "{{owner_email}}" on send_email node "${n.id}"`);
      }
    }
  }

  // 3. Graph connectivity: BFS from trigger to ensure all non-trigger
  //    nodes are reachable.
  if (triggerNode) {
    const adjacency = new Map<string, string[]>();
    for (const e of edges) {
      if (!adjacency.has(e.source)) adjacency.set(e.source, []);
      adjacency.get(e.source)!.push(e.target);
    }
    const visited = new Set<string>();
    const queue = [triggerNode.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const neighbors = adjacency.get(current) || [];
      queue.push(...neighbors);
    }
    const unreachable = nodes.filter(
      (n) => !visited.has(n.id) && !n.type.startsWith("trigger_"),
    );
    if (unreachable.length > 0) {
      // Wire unreachable nodes to the trigger
      for (const u of unreachable) {
        edges.push({
          id: `${triggerNode.id}->${u.id}`,
          source: triggerNode.id,
          target: u.id,
        });
        warnings.push(`Auto-wired unreachable node "${u.id}" to trigger`);
      }
    }
  }

  return {
    name: name.slice(0, 80),
    description: description.slice(0, 240),
    graph: { nodes, edges },
    _warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function humanize(type: StepType): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── OpenAI call ───────────────────────────────────────────────

/**
 * Generate a workflow graph from a user prompt, optionally enriched
 * with a chosen proposal and book summary from the two-phase flow.
 *
 * Backwards-compatible: passing a string still works.
 *
 * When `proposal` is provided (from /api/dante/workflows/propose),
 * we hand the model a much more specific spec than the raw advisor
 * prompt — which is what the proposal was designed for. When
 * `bookSummary` is provided, we add a compact workspace-context
 * preamble so the model picks filter values that actually match the
 * advisor's data (e.g. segment size, existing workflows to avoid
 * duplicating).
 */
export interface ConnectedIntegration {
  provider: string;
  provider_kind: string | null;
  display_name: string | null;
}

export async function generateWorkflow(
  input:
    | string
    | {
        prompt: string;
        proposal?: WorkflowProposal;
        bookSummary?: BookSummary;
        connectedIntegrations?: ConnectedIntegration[];
      }
): Promise<GeneratedWorkflow> {
  const prompt = (typeof input === "string" ? input : input.prompt).trim();
  if (!prompt) throw new Error("Prompt required");
  const proposal = typeof input === "string" ? undefined : input.proposal;
  const bookSummary =
    typeof input === "string" ? undefined : input.bookSummary;
  const connectedIntegrations =
    typeof input === "string" ? undefined : input.connectedIntegrations;

  // Build the user message. If a proposal exists, the proposal's
  // enriched_prompt IS the spec we want the model to implement — the
  // raw advisor prompt is preserved for provenance but takes a back
  // seat.
  const userMessage = buildUserMessage(prompt, proposal, bookSummary, connectedIntegrations);

  const result = await llmComplete({
    // Sonnet for structured graph output — better instruction-following
    // than Haiku, much cheaper than Opus on long JSON.
    model: "claude-sonnet-4-6",
    temperature: 0.2,
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    feature: "workflow.generate",
  });
  const content = result.message.content;
  if (typeof content !== "string") throw new Error("LLM returned no content");

  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch { throw new Error("OpenAI returned invalid JSON"); }

  return validate(parsed);
}

function buildUserMessage(
  prompt: string,
  proposal: WorkflowProposal | undefined,
  bookSummary: BookSummary | undefined,
  connectedIntegrations?: ConnectedIntegration[],
): string {
  const parts: string[] = [];

  if (bookSummary) {
    parts.push(
      `WORKSPACE CONTEXT\n${renderBookSummaryText(bookSummary)}\n\nUse this to pick realistic filter values and avoid duplicating any existing workflow listed above.`
    );
  }

  // Integration awareness: tell the LLM which data providers are
  // connected so it includes integration_query nodes where useful
  // and skips providers the workspace doesn't have.
  if (connectedIntegrations && connectedIntegrations.length > 0) {
    const list = connectedIntegrations
      .map((c) => `- ${c.display_name || c.provider} (${c.provider_kind || "general"})`)
      .join("\n");
    parts.push(
      `CONNECTED INTEGRATIONS\nThe workspace has these active data provider connections:\n${list}\n\nInclude integration_query nodes for these providers where they add value to the workflow. Use the provider name as the "provider" field in the node config.`
    );
  } else {
    parts.push(
      `CONNECTED INTEGRATIONS\nThe workspace has no third-party integrations connected. Do NOT use integration_query nodes — they will fail without credentials.`
    );
  }

  if (proposal) {
    parts.push(
      `BROKER'S ORIGINAL PROMPT\n"""\n${prompt}\n"""`
    );
    parts.push(
      `CHOSEN PROPOSAL\nTitle: ${proposal.title}\nDescription: ${proposal.description}\nTrigger: ${proposal.trigger.type} (${proposal.trigger.detail})\nNode sketch: ${proposal.node_sketch.join(" → ")}\nProjected volume: ${
        proposal.projected_volume.estimate === null
          ? "unknown"
          : `~${proposal.projected_volume.estimate} ${proposal.projected_volume.unit}`
      } — ${proposal.projected_volume.reasoning}\n\nBUILD SPEC (implement this exactly)\n${proposal.enriched_prompt}`
    );
  } else {
    parts.push(prompt);
  }

  return parts.join("\n\n");
}
