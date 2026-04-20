// lib/dante/workflow-runner.ts
//
// Dante workflow runtime — the sequential step executor. Takes a
// WorkflowDefinition + optional input, walks its steps one by one,
// passes each step's output into the shared context so later steps
// can template off it, and returns a structured log.
//
// Design notes:
//   • Linear execution for v1 — no branching beyond `condition` step.
//     Phase 2 adds a true DAG + parallel execution; the log shape is
//     already DAG-friendly (each entry is keyed by step id).
//   • Template syntax is {{steps.<id>.<path>}} or {{input.<path>}}.
//     We only substitute strings; non-string config values pass
//     through untouched. That keeps simple JSON bodies usable.
//   • All external calls (HTTP, OpenAI, Resend) happen server-side
//     with the service-role Supabase client — this must never be
//     called from a browser.

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  WorkflowDefinition,
  WorkflowStep,
  StepLogEntry,
  WorkflowRunResult,
} from "./workflow-types";

// ── Template resolver ─────────────────────────────────────────

type Ctx = {
  input: Record<string, unknown>;
  steps: Record<string, unknown>;
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
// Not a general expression language — just enough to be useful:
//   "<left> contains <right>"
//   "<left> == <right>"  / "<left> != <right>"
//   "<left> > <num>"     / "<left> < <num>"
// Strings should be quoted with ' or ". Everything else is treated
// as a number if parseable, else string.

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
  // Fallback: truthy check on the resolved string.
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

async function runHttp(step: Extract<WorkflowStep, { type: "http" }>, ctx: Ctx) {
  const cfg = resolveTemplate(step.config, ctx) as {
    url: string; method?: string; headers?: Record<string, string>; body?: unknown;
  };
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

async function runOpenAI(step: Extract<WorkflowStep, { type: "openai" }>, ctx: Ctx) {
  const cfg = resolveTemplate(step.config, ctx) as {
    model?: string; system?: string; prompt: string; max_tokens?: number;
  };
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const messages: Array<{ role: string; content: string }> = [];
  if (cfg.system) messages.push({ role: "system", content: cfg.system });
  messages.push({ role: "user", content: cfg.prompt });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model || "gpt-4o-mini",
      messages,
      max_tokens: cfg.max_tokens || 800,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  return { text, raw: json };
}

async function runQueryClients(
  step: Extract<WorkflowStep, { type: "query_clients" }>,
  ctx: Ctx,
  workspaceId: string
) {
  const cfg = resolveTemplate(step.config, ctx) as {
    filter?: Record<string, string>; limit?: number;
  };
  let q = supabaseAdmin
    .from("contacts")
    .select("id, name, email, phone, created_at")
    .eq("workspace_id", workspaceId);
  for (const [k, v] of Object.entries(cfg.filter || {})) {
    q = q.eq(k, v);
  }
  q = q.limit(Math.min(cfg.limit ?? 50, 500));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { contacts: data || [], count: data?.length ?? 0 };
}

async function runUpdateContact(
  step: Extract<WorkflowStep, { type: "update_contact" }>,
  ctx: Ctx,
  workspaceId: string
) {
  const cfg = resolveTemplate(step.config, ctx) as {
    contact_id: string; patch: Record<string, unknown>;
  };
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

async function runSendEmail(step: Extract<WorkflowStep, { type: "send_email" }>, ctx: Ctx) {
  const cfg = resolveTemplate(step.config, ctx) as {
    to: string; subject: string; html?: string; text?: string;
  };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const from = process.env.RESEND_FROM_EMAIL || "noreply@driftai.studio";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: cfg.to,
      subject: cfg.subject,
      html: cfg.html,
      text: cfg.text,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || `Resend ${res.status}`);
  return { email_id: json.id, to: cfg.to };
}

async function runCondition(step: Extract<WorkflowStep, { type: "condition" }>, ctx: Ctx) {
  const resolved = resolveTemplate(step.config.expression, ctx) as string;
  const passed = evaluateCondition(resolved);
  return { expression: resolved, passed };
}

async function runDelay(step: Extract<WorkflowStep, { type: "delay" }>) {
  const seconds = Math.min(60, Math.max(0, step.config.seconds || 0));
  await new Promise((r) => setTimeout(r, seconds * 1000));
  return { waited_seconds: seconds };
}

// ── Main ──────────────────────────────────────────────────────

export async function runWorkflow(
  workflow: WorkflowDefinition,
  input: Record<string, unknown> = {}
): Promise<WorkflowRunResult> {
  const ctx: Ctx = { input, steps: {} };
  const log: StepLogEntry[] = [];

  for (const step of workflow.steps) {
    const started_at = new Date().toISOString();
    try {
      let output: unknown;
      switch (step.type) {
        case "http":           output = await runHttp(step, ctx); break;
        case "openai":         output = await runOpenAI(step, ctx); break;
        case "query_clients":  output = await runQueryClients(step, ctx, workflow.workspace_id); break;
        case "update_contact": output = await runUpdateContact(step, ctx, workflow.workspace_id); break;
        case "send_email":     output = await runSendEmail(step, ctx); break;
        case "condition":      output = await runCondition(step, ctx); break;
        case "delay":          output = await runDelay(step); break;
        default: {
          // Should be unreachable. Kept for runtime safety if the DB
          // ever holds a step type the runner hasn't learned yet.
          const t = (step as { type: string }).type;
          throw new Error(`Unknown step type: ${t}`);
        }
      }

      ctx.steps[step.id] = output;
      log.push({
        step_id: step.id,
        step_type: step.type,
        step_name: step.name || step.type,
        status: "success",
        started_at,
        finished_at: new Date().toISOString(),
        output,
      });

      // Condition step can short-circuit the run if it evaluates false.
      if (
        step.type === "condition" &&
        (output as { passed: boolean }).passed === false &&
        step.config.on_false === "stop"
      ) {
        return { status: "success", log, output: ctx.steps };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.push({
        step_id: step.id,
        step_type: step.type,
        step_name: step.name || step.type,
        status: "error",
        started_at,
        finished_at: new Date().toISOString(),
        error: message,
      });
      if (step.on_error === "continue") continue;
      return { status: "error", log, output: ctx.steps, error: message };
    }
  }

  return { status: "success", log, output: ctx.steps };
}
