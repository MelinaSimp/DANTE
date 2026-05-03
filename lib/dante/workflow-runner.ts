// lib/dante/workflow-runner.ts
//
// Dante workflow runtime — DAG executor.
//
// Phase 1 was a linear step list. Phase 2 walks a graph: start from
// the trigger node, execute each reachable node once, and choose
// outgoing edges based on node type:
//
//   • condition nodes — emit on the "true" handle if the expression
//     evaluates true, on "false" otherwise.
//   • everything else — follow all outgoing edges (which is usually
//     just one; multiple outgoing edges from a plain action is a
//     valid way to fan-out, though we execute them sequentially).
//
// Execution order is topo-sorted within each reachable subgraph, so a
// node with multiple incoming edges only fires after all its parents
// have run. Parallel execution is a phase-3 flag.
//
// Triggers are pass-throughs: the run's `input` is exposed at
// {{steps.<trigger_id>.input}} so downstream nodes can pick it up.

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  WorkflowDefinition,
  WorkflowStep,
  StepLogEntry,
  WorkflowRunResult,
  GraphNode,
} from "./workflow-types";
import { loadWorkspaceSecrets, redactSecrets, type SecretMap } from "./secrets";
import { searchArchive, formatHitsForPrompt } from "./archive/search";
import { runAgent } from "./agent";
import { complete as llmComplete } from "@/lib/llm/client";

// ── Template resolver ─────────────────────────────────────────

type Ctx = {
  input: Record<string, unknown>;
  steps: Record<string, unknown>;
  secrets: SecretMap;
  // When true, side-effect runners (http non-GET, send_email,
  // update_contact) skip the real call and return a "simulated"
  // payload describing what they *would* have done. Read-only work
  // (query_clients, archive_lookup, openai, condition, delay) still
  // executes so the advisor sees real numbers and actual draft
  // content. This is the "Test run" button in the editor.
  simulate?: boolean;
};

function getPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function resolveTemplate(value: unknown, ctx: Ctx): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
      const val = getPath(ctx, expr);
      return val == null ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplate(v, ctx));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTemplate(v, ctx);
    return out;
  }
  return value;
}

// ── Condition mini-evaluator ──────────────────────────────────
//   "<left> contains <right>"
//   "<left> == <right>"  / "<left> != <right>"
//   "<left> > <num>"     / "<left> < <num>"
// Strings quoted with ' or ". Numbers parsed when possible.

function evaluateCondition(expr: string): boolean {
  const contains = expr.match(/^(.+?)\s+contains\s+(.+)$/i);
  if (contains) {
    const [, l, r] = contains;
    return String(l).includes(stripQuotes(r));
  }
  const cmp = expr.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (cmp) {
    const [, l, op, r] = cmp;
    const lv = coerce(l.trim()), rv = coerce(stripQuotes(r.trim()));
    switch (op) {
      case "==": return lv === rv;
      case "!=": return lv !== rv;
      case ">":  return Number(lv) >  Number(rv);
      case "<":  return Number(lv) <  Number(rv);
      case ">=": return Number(lv) >= Number(rv);
      case "<=": return Number(lv) <= Number(rv);
    }
  }
  return Boolean(expr && expr !== "false" && expr !== "0");
}

function stripQuotes(s: string): string {
  const m = s.match(/^['"](.*)['"]$/);
  return m ? m[1] : s;
}

function coerce(s: string): string | number {
  const n = Number(s);
  return isNaN(n) ? s : n;
}

// ── Step runners ──────────────────────────────────────────────
// These take the pre-resolved config (templates already substituted
// in) rather than the raw step, so the dispatch below can do one
// resolveTemplate() pass per node.

async function runHttp(cfg: {
  url: string; method?: string; headers?: Record<string, string>; body?: unknown;
}) {
  const res = await fetch(cfg.url, {
    method: cfg.method || "GET",
    headers: { "Content-Type": "application/json", ...(cfg.headers || {}) },
    body: cfg.body !== undefined && cfg.method && cfg.method !== "GET"
      ? typeof cfg.body === "string" ? cfg.body : JSON.stringify(cfg.body)
      : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, ok: res.ok, body: json ?? text };
}

async function runOpenAI(cfg: {
  model?: string; system?: string; prompt: string; max_tokens?: number;
}) {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (cfg.system) messages.push({ role: "system", content: cfg.system });
  messages.push({ role: "user", content: cfg.prompt });
  const result = await llmComplete({
    model: cfg.model || "gpt-5",
    messages,
    maxTokens: Number(cfg.max_tokens) || 800,
    feature: "workflow.openai_node",
  });
  return { text: result.message.content ?? "", raw: result.raw };
}

async function runQueryClients(
  cfg: { filter?: Record<string, string>; limit?: number },
  workspaceId: string
) {
  let q = supabaseAdmin
    .from("contacts")
    .select("id, name, email, phone, created_at")
    .eq("workspace_id", workspaceId);
  // Skip empty filter values. resolveTemplate() turns unresolved
  // `{{steps.x.y}}` references into empty strings, and Postgres rejects
  // `WHERE created_at = ''` with a 22007 "invalid timestamp" error.
  // Treating "", null, and undefined as "don't filter" is the right
  // default anyway — a user who didn't supply a value meant "any".
  for (const [k, v] of Object.entries(cfg.filter || {})) {
    if (v === "" || v === null || v === undefined) continue;
    q = q.eq(k, v);
  }
  const limit = Math.min(Math.max(Number(cfg.limit) || 25, 1), 500);
  q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { contacts: data || [], count: data?.length ?? 0 };
}

async function runUpdateContact(
  cfg: { contact_id: string; patch: Record<string, unknown> },
  workspaceId: string
) {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .update(cfg.patch)
    .eq("id", cfg.contact_id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { contact: data };
}

async function runSendEmail(cfg: {
  to: string; subject: string; html?: string; text?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const from = process.env.RESEND_FROM_EMAIL || "noreply@driftai.studio";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: cfg.to, subject: cfg.subject, html: cfg.html, text: cfg.text,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || `Resend ${res.status}`);
  return { email_id: json.id, to: cfg.to };
}

// SMS / iMessage delivery via SendBlue. Returns the delivery channel
// SendBlue actually used (iMessage if the recipient is on Apple,
// otherwise green-bubble SMS) so the audit log records what was
// actually sent — not just what was attempted.
async function runSendSms(cfg: { to_phone: string; body: string; from_number?: string }) {
  // Local import keeps lib/dante/ free of an SMS-stack dependency
  // until it's actually invoked at run time.
  const { sendMessage } = await import("@/lib/sms/sender");
  const result = await sendMessage(cfg.to_phone, cfg.body, {
    fromNumber: cfg.from_number,
  });
  return {
    to_phone: cfg.to_phone,
    delivery_channel: result.delivery_channel,
    message_id: result.message_id,
  };
}

async function runDelay(cfg: { seconds: number }) {
  const seconds = Math.min(60, Math.max(0, Number(cfg.seconds) || 0));
  await new Promise((r) => setTimeout(r, seconds * 1000));
  return { waited_seconds: seconds };
}

async function runArchiveLookup(
  cfg: { query: string; k?: number; kind?: string },
  workspaceId: string,
) {
  const query = String(cfg.query || "").trim();
  if (!query) {
    return { hits: [], context: "(no query provided)", citations: [] };
  }
  const hits = await searchArchive({
    workspaceId,
    query,
    k: Number(cfg.k) || 5,
    kindFilter: cfg.kind || undefined,
  });
  // `context` is the headline output — a formatted string downstream
  // openai steps can drop straight into a prompt as
  // {{steps.<id>.context}}. `hits` stays available for anyone who
  // wants to branch off similarity scores or cite specific pages.
  return {
    hits,
    context: formatHitsForPrompt(hits),
    citations: hits.map((h) => ({
      document_id: h.document_id,
      document_title: h.document_title,
      page: h.page_number,
      similarity: h.similarity,
    })),
  };
}

// ── Graph walk ────────────────────────────────────────────────

/**
 * Single dispatch point — given a node and a resolved context, produce
 * the node's output. Triggers pass the run input straight through.
 */
async function executeNode(
  step: WorkflowStep,
  ctx: Ctx,
  workspaceId: string,
  log: StepLogEntry[],
  runId: string,
): Promise<unknown> {
  const cfg = resolveTemplate(step.config, ctx) as Record<string, unknown>;

  switch (step.type) {
    case "trigger_manual":
    case "trigger_cron":
    case "trigger_webhook":
      // Triggers expose the run input so downstream can template off
      // {{steps.<trigger_id>.input.<field>}}.
      return { input: ctx.input };
    case "http": {
      const httpCfg = cfg as Parameters<typeof runHttp>[0];
      // GETs are safe to run in simulate mode (read-only); other
      // methods might mutate external state, so we stub those.
      if (ctx.simulate && httpCfg.method && httpCfg.method.toUpperCase() !== "GET") {
        return {
          simulated: true,
          would_have: {
            action: "http",
            method: httpCfg.method,
            url: httpCfg.url,
          },
        };
      }
      return runHttp(httpCfg);
    }
    case "openai":
      return runOpenAI(cfg as Parameters<typeof runOpenAI>[0]);
    case "query_clients":
      return runQueryClients(cfg as Parameters<typeof runQueryClients>[0], workspaceId);
    case "update_contact": {
      const upCfg = cfg as Parameters<typeof runUpdateContact>[0];
      if (ctx.simulate) {
        return {
          simulated: true,
          would_have: {
            action: "update_contact",
            contact_id: upCfg.contact_id,
            patch: upCfg.patch,
          },
        };
      }
      return runUpdateContact(upCfg, workspaceId);
    }
    case "send_email": {
      const emailCfg = cfg as Parameters<typeof runSendEmail>[0];
      if (ctx.simulate) {
        return {
          simulated: true,
          would_have: {
            action: "send_email",
            to: emailCfg.to,
            subject: emailCfg.subject,
            // Don't inflate the log with full HTML — keep a short
            // preview so the advisor can eyeball "is the draft good?"
            text_preview:
              typeof emailCfg.text === "string"
                ? emailCfg.text.slice(0, 400)
                : typeof emailCfg.html === "string"
                ? emailCfg.html.slice(0, 400)
                : "",
          },
        };
      }
      return runSendEmail(emailCfg);
    }
    case "send_sms": {
      const smsCfg = cfg as Parameters<typeof runSendSms>[0];
      if (ctx.simulate) {
        return {
          simulated: true,
          would_have: {
            action: "send_sms",
            to_phone: smsCfg.to_phone,
            body_preview:
              typeof smsCfg.body === "string" ? smsCfg.body.slice(0, 400) : "",
          },
        };
      }
      return runSendSms(smsCfg);
    }
    case "condition": {
      const expr = String(cfg.expression ?? "");
      const passed = evaluateCondition(expr);
      return { expression: expr, passed };
    }
    case "delay":
      return runDelay(cfg as Parameters<typeof runDelay>[0]);
    case "archive_lookup":
      return runArchiveLookup(
        cfg as Parameters<typeof runArchiveLookup>[0],
        workspaceId,
      );
    case "agent": {
      // The agent loop appends per-tool-call sub-entries directly to
      // the log array so the run timeline shows each tool the model
      // chose. The wrapping "agent" entry (added by the main loop
      // below) summarizes the final answer. Templates resolve against
      // the current step output already, so the resolved cfg is what
      // the loop sees as objective/system.
      const agentStep = { ...step, config: cfg } as Parameters<typeof runAgent>[0]["step"];
      const result = await runAgent({
        step: agentStep,
        workspaceId,
        simulate: !!ctx.simulate,
        runId,
        log,
      });
      return {
        text: result.text,
        output: result.output,
        steps_taken: result.steps_taken,
        truncated: result.truncated,
      };
    }
    default: {
      const t = (step as { type: string }).type;
      throw new Error(`Unknown node type: ${t}`);
    }
  }
}

/**
 * Pick the outgoing node ids we should visit after `nodeId` runs.
 * Condition nodes use the sourceHandle to branch; everything else
 * follows every outgoing edge.
 */
function nextNodeIds(
  nodeId: string,
  nodeType: WorkflowStep["type"],
  output: unknown,
  edges: WorkflowDefinition["graph"]["edges"]
): string[] {
  const outgoing = edges.filter((e) => e.source === nodeId);

  if (nodeType === "condition") {
    const passed = (output as { passed: boolean })?.passed === true;
    const handle: "true" | "false" = passed ? "true" : "false";
    return outgoing
      .filter((e) => (e.sourceHandle || "true") === handle)
      .map((e) => e.target);
  }

  return outgoing.map((e) => e.target);
}

/**
 * Find the trigger node. If multiple triggers exist (shouldn't
 * happen, but be robust), prefer trigger_manual > webhook > cron
 * for a manual run, and fall back to the first trigger we see.
 */
function findTrigger(nodes: GraphNode[]): GraphNode | null {
  const triggers = nodes.filter((n) => n.type.startsWith("trigger_"));
  if (triggers.length === 0) return null;
  return (
    triggers.find((n) => n.type === "trigger_manual") ||
    triggers.find((n) => n.type === "trigger_webhook") ||
    triggers[0]
  );
}

// ── Main ──────────────────────────────────────────────────────

export async function runWorkflow(
  workflow: WorkflowDefinition,
  input: Record<string, unknown> = {},
  options: { simulate?: boolean; runId?: string } = {}
): Promise<WorkflowRunResult> {
  // Synthesize a run id if the caller didn't supply one. The agent
  // node uses this as the source_id when it writes to dante_memory
  // (so memories can be traced back to the run that produced them).
  const runId = options.runId || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Load the workspace secret vault once up front. Templates can
  // reference them as {{secrets.foo}}; the resolver treats them like
  // any other namespace, and we redact raw values from the log below.
  const secrets = await loadWorkspaceSecrets(workflow.workspace_id);
  const ctx: Ctx = { input, steps: {}, secrets, simulate: !!options.simulate };
  const log: StepLogEntry[] = [];

  const { nodes, edges } = workflow.graph;
  if (nodes.length === 0) {
    return { status: "success", log, output: {} };
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const trigger = findTrigger(nodes);
  if (!trigger) {
    return {
      status: "error",
      log,
      output: {},
      error: "No trigger node in graph. Add a trigger to start the workflow.",
    };
  }

  // Fire-once BFS from the trigger. Each node runs the first time
  // it's dequeued; convergent nodes (multiple parents) fire once as
  // soon as any parent reaches them. True wait-for-all-parents
  // semantics is a phase-3 upgrade and rarely useful in practice —
  // n8n's own default is "whoever gets here first wins".
  const queue: string[] = [trigger.id];
  const fired = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (fired.has(id)) continue;
    const node = nodeById.get(id);
    if (!node) continue;
    fired.add(id);

    const step = node.data.step;
    const started_at = new Date().toISOString();
    let output: unknown;
    let errored = false;

    try {
      output = await executeNode(step, ctx, workflow.workspace_id, log, runId);
      ctx.steps[step.id] = output;
      log.push({
        step_id: step.id,
        step_type: step.type,
        step_name: step.name || step.type,
        status: "success",
        started_at,
        finished_at: new Date().toISOString(),
        // Scrub raw secret values out of anything we're about to
        // persist. ctx.steps keeps the original so downstream templates
        // can still reference it.
        output: redactSecrets(output, secrets),
      });
    } catch (err) {
      errored = true;
      const message = err instanceof Error ? err.message : String(err);
      log.push({
        step_id: step.id,
        step_type: step.type,
        step_name: step.name || step.type,
        status: "error",
        started_at,
        finished_at: new Date().toISOString(),
        error: redactSecrets(message, secrets),
      });
      if (step.on_error !== "continue") {
        return {
          status: "error",
          log,
          output: redactSecrets(ctx.steps, secrets),
          error: redactSecrets(message, secrets),
        };
      }
      // on_error === "continue": fall through and still walk children
      // so the rest of the graph can make progress.
      ctx.steps[step.id] = { error: message };
    }

    const nexts = errored
      ? edges.filter((e) => e.source === id).map((e) => e.target)
      : nextNodeIds(id, step.type, output, edges);
    for (const n of nexts) if (!fired.has(n)) queue.push(n);
  }

  return { status: "success", log, output: redactSecrets(ctx.steps, secrets) };
}
