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

export interface GeneratedWorkflow {
  name: string;
  description: string;
  graph: WorkflowGraph;
}

// ── Prompt ────────────────────────────────────────────────────
// Keep this verbose on purpose — the model needs full config shapes
// per node type plus the templating convention to emit something the
// runner can actually execute.

const SYSTEM_PROMPT = `
You are Dante, a workflow architect for a CRM called Drift. You translate
a user's natural-language request into a Drift workflow graph. You output
ONLY a single JSON object, no prose, with this exact shape:

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
     - "trigger_manual"   → user clicks Run
     - "trigger_cron"     → time-based. config.cron is a 5-field crontab.
     - "trigger_webhook"  → external POST fires the run.
   The trigger node's step object looks like:
     { "id": "trigger", "type": "trigger_manual", "name": "Manual trigger", "config": {} }
   or for cron:
     { "id": "trigger", "type": "trigger_cron", "name": "Every day 9am", "config": { "cron": "0 9 * * *" } }

2. Other node types and their config schema:
   - "http":
     config: { "url": "https://...", "method": "GET"|"POST"|"PUT"|"PATCH"|"DELETE",
               "headers": {...}, "body": {...} }
   - "openai" (chat completion → emits { text }):
     config: { "model": "gpt-5", "system": "...", "prompt": "...", "max_tokens": 800 }
   - "query_clients" (Supabase select on contacts table → emits { contacts: [...], count }):
     config: { "filter": { "column": "value" }, "limit": 25 }
     Available columns on contacts: id, name, email, phone, created_at.
   - "update_contact" (patch one contact):
     config: { "contact_id": "uuid or template", "patch": { ... } }
   - "send_email" (Resend):
     config: { "to": "...", "subject": "...", "html": "...", "text": "..." }
   - "condition" (emits "true" or "false" handle):
     config: { "expression": "{{steps.x.text}} contains 'yes'", "on_false": "stop"|"continue" }
     Supported expression operators: "contains", "==", "!=", ">", "<", ">=", "<=".
   - "delay":
     config: { "seconds": 5 }  // max 60s
   - "archive_lookup" (vector-search the firm's Archive of legal /
     compliance docs → emits { hits, context, citations }):
     config: { "query": "...", "k": 5, "kind": "form_adv"|"ips"|"prospectus"|"client_agreement"|"policy"|"regulation"|"memo"|"other" }
     The emitted "context" string is pre-formatted with citation
     numbers ([1], [2]…) ready to drop into a downstream openai
     prompt — this is the Harvey citation pattern.

3. IDs are short snake_case unique strings, e.g. "classify", "send_alert".
   Node id, data.step.id, and edge ids must all match up.

4. Edges connect nodes. Use sourceHandle ONLY on edges that leave a
   condition node — "true" for the pass branch, "false" for the fail
   branch. Every other edge omits sourceHandle entirely (or sets null).

5. Templating: any config string can reference a prior node's output
   with {{steps.<node_id>.<path>}}. The trigger exposes the run input
   at {{steps.<trigger_id>.input.<field>}}. Example:
     prompt: "Classify this reply: {{steps.trigger.input.message}}"
     to:     "{{steps.find.contacts.0.email}}"

   Secrets (API keys, advisor email, tokens) come from the workspace
   vault and are referenced as {{secrets.<key>}}. Use this for any
   durable credential the user would set once and reuse — e.g.
   "to": "{{secrets.advisor_email}}", "Authorization": "Bearer {{secrets.custodian_token}}".

   IMPORTANT: never reference a template path that won't exist at
   runtime. If a filter value is optional, OMIT the key rather than
   referencing a step output that may be undefined — empty strings
   sent to typed columns (e.g. timestamptz) will make the run fail.

6. Positions: lay nodes out reasonably — trigger at {x:80,y:80}, then
   each downstream node 160px below its parent. Branching conditions
   can spread left/right (x ± 240). Don't worry about pixel perfection;
   the editor will tidy up.

7. Prefer small graphs. 3–6 nodes is typical. Only add nodes that the
   user's request actually needs. If the user says "email me when a new
   contact is added", you still need a trigger — use trigger_webhook
   with a TODO note, or trigger_manual if unclear.

8. Cron scheduling: the hosting platform (Vercel Hobby) only allows
   cron expressions that fire at most ONCE per day — minute / hourly
   crons will be rejected at deploy time. If the user asks for
   sub-daily frequency, still generate a workflow but set it to a
   sensible daily time (e.g. "0 13 * * *" for 9am ET) and mention in
   the description that the user can wire an external scheduler if
   they need more frequency.

9. Never invent node types. Stick to the list above.

OUTPUT ONLY THE JSON OBJECT.
`.trim();

// ── Validation ────────────────────────────────────────────────
// Strict enough to keep bad output out of the DB, lenient enough that
// a close-but-not-perfect model response still runs. Anything missing
// a required field throws and the API route returns a 422.

const VALID_STEP_TYPES: StepType[] = [
  "trigger_manual", "trigger_cron", "trigger_webhook",
  "http", "openai", "query_clients", "update_contact",
  "send_email", "condition", "delay", "archive_lookup",
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

  // Auto-layout: if every node has the same x AND y (model punted), or
  // positions overlap, lay them out as a vertical column.
  const positions = new Set(nodes.map((n) => `${n.position.x},${n.position.y}`));
  if (positions.size < nodes.length) {
    nodes.forEach((n, i) => { n.position = { x: 80, y: 80 + i * 140 }; });
  }

  return {
    name: name.slice(0, 80),
    description: description.slice(0, 240),
    graph: { nodes, edges },
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
export async function generateWorkflow(
  input:
    | string
    | {
        prompt: string;
        proposal?: WorkflowProposal;
        bookSummary?: BookSummary;
      }
): Promise<GeneratedWorkflow> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const prompt = (typeof input === "string" ? input : input.prompt).trim();
  if (!prompt) throw new Error("Prompt required");
  const proposal = typeof input === "string" ? undefined : input.proposal;
  const bookSummary =
    typeof input === "string" ? undefined : input.bookSummary;

  // Build the user message. If a proposal exists, the proposal's
  // enriched_prompt IS the spec we want the model to implement — the
  // raw advisor prompt is preserved for provenance but takes a back
  // seat.
  const userMessage = buildUserMessage(prompt, proposal, bookSummary);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      // GPT-4o is worth the ~3× cost over mini for structured graph output.
      model: "gpt-5",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenAI returned no content");

  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch { throw new Error("OpenAI returned invalid JSON"); }

  return validate(parsed);
}

function buildUserMessage(
  prompt: string,
  proposal: WorkflowProposal | undefined,
  bookSummary: BookSummary | undefined
): string {
  const parts: string[] = [];

  if (bookSummary) {
    parts.push(
      `WORKSPACE CONTEXT\n${renderBookSummaryText(bookSummary)}\n\nUse this to pick realistic filter values and avoid duplicating any existing workflow listed above.`
    );
  }

  if (proposal) {
    parts.push(
      `ADVISOR'S ORIGINAL PROMPT\n"""\n${prompt}\n"""`
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
