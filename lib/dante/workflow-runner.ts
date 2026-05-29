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
import { TAGS as SOURCE_TAGS, type SourceTag } from "./source-tiers";
import { searchArchive, formatHitsForPrompt } from "./archive/search";
import { runAgent } from "./agent";
import { complete as llmComplete } from "@/lib/llm/client";

// ── Retry with exponential backoff ───────────────────────────
// Wraps any async function with 3 attempts. Only retries on
// transient failures (network errors, 5xx, rate limits). Validation
// errors (4xx, missing config) fail immediately.

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 4000, 16000]; // ms between attempts

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // Network failures
    if (msg.includes("fetch failed") || msg.includes("econnreset") ||
        msg.includes("econnrefused") || msg.includes("etimedout") ||
        msg.includes("socket hang up") || msg.includes("network") ||
        msg.includes("dns") || msg.includes("abort")) return true;
    // HTTP 5xx or rate limit
    if (/\b(50[0-9]|429)\b/.test(msg)) return true;
    // Timeout
    if (msg.includes("timeout") || msg.includes("timed out")) return true;
  }
  return false;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES - 1 && isRetryable(err)) {
        const delay = RETRY_DELAYS[attempt] ?? 4000;
        console.warn(`[workflow-runner] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err instanceof Error ? err.message : err);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err; // non-retryable or final attempt
      }
    }
  }
  throw lastErr; // unreachable but satisfies TS
}

// ── Rate limiting ────────────────────────────────────────────
// Per-workspace hourly caps on email and SMS sends to prevent
// runaway for_each loops from burning the domain reputation.

const RATE_LIMITS = { email: 200, sms: 100 } as const;

async function checkRateLimit(
  workspaceId: string,
  channel: "email" | "sms",
  count: number = 1,
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limit = RATE_LIMITS[channel];
  const windowStart = new Date();
  windowStart.setMinutes(0, 0, 0);

  // Atomic upsert+increment via RPC (created in migration)
  const { data, error } = await supabaseAdmin.rpc("increment_send_counter", {
    p_workspace_id: workspaceId,
    p_channel: channel,
    p_window_start: windowStart.toISOString(),
    p_count: count,
  });

  if (error) {
    // If the RPC doesn't exist yet (migration not run), allow through
    // but log. Don't block workflows on a missing rate-limit table.
    console.warn("[rate-limit] RPC failed, allowing through:", error.message);
    return { allowed: true, current: 0, limit };
  }

  const current = typeof data === "number" ? data : (data?.[0]?.send_count ?? count);
  return { allowed: current <= limit, current, limit };
}

// ── Cancellation check ──────────────────────────────────────
// Called every few nodes during BFS to allow mid-execution
// cancellation. Returns true if the run has been cancelled.

async function isRunCancelled(runId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("dante_workflow_runs")
    .select("status")
    .eq("id", runId)
    .maybeSingle();
  return data?.status === "cancelled";
}

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

// ── Date math resolver ─────────────────────────────────────
// Handles built-in expressions: "now", "now - 24h", "now - 7d",
// "now - 2w", "now - 1m". Returns ISO string or null if not a
// date expression.

function resolveDateExpr(expr: string): string | null {
  const trimmed = expr.trim();
  if (trimmed === "now") return new Date().toISOString();

  const match = trimmed.match(
    /^now\s*([+-])\s*(\d+)\s*(h|d|w|m|hours?|days?|weeks?|months?)$/i
  );
  if (!match) return null;

  const [, sign, amount, unit] = match;
  const n = parseInt(amount, 10);
  const now = new Date();

  let ms = 0;
  switch (unit.toLowerCase().replace(/s$/, "")) {
    case "h":
    case "hour":
      ms = n * 60 * 60 * 1000;
      break;
    case "d":
    case "day":
      ms = n * 24 * 60 * 60 * 1000;
      break;
    case "w":
    case "week":
      ms = n * 7 * 24 * 60 * 60 * 1000;
      break;
    case "m":
    case "month":
      ms = n * 30 * 24 * 60 * 60 * 1000;
      break;
    default:
      return null;
  }

  const result = new Date(
    sign === "-" ? now.getTime() - ms : now.getTime() + ms
  );
  return result.toISOString();
}

function resolveTemplate(value: unknown, ctx: Ctx): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
      // Try date math first (now, now - 24h, etc.)
      const dateResult = resolveDateExpr(expr);
      if (dateResult) return dateResult;

      // Then try path lookup (steps.x.y, secrets.z, input.w)
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
  return withRetry(async () => {
    const res = await fetch(cfg.url, {
      method: cfg.method || "GET",
      headers: { "Content-Type": "application/json", ...(cfg.headers || {}) },
      body: cfg.body !== undefined && cfg.method && cfg.method !== "GET"
        ? typeof cfg.body === "string" ? cfg.body : JSON.stringify(cfg.body)
        : undefined,
    });
    // Throw on 5xx so retry kicks in; 4xx is a client error, don't retry.
    if (res.status >= 500) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, ok: res.ok, body: json ?? text };
  }, `http ${cfg.method || "GET"} ${cfg.url}`);
}

// Hard rule appended to every LLM system prompt in workflow steps.
// Prevents emojis from leaking into workflow-generated emails and reports.
const NO_EMOJI_SUFFIX =
  "\n\nNever use emojis in any output — not in headings, bullet points, " +
  "tables, subject lines, or anywhere else. No unicode symbols like " +
  "warning signs, checkmarks, or decorative characters. Plain text only.";

async function runOpenAI(cfg: {
  model?: string; system?: string; prompt: string; max_tokens?: number;
}) {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (cfg.system) messages.push({ role: "system", content: cfg.system + NO_EMOJI_SUFFIX });
  messages.push({ role: "user", content: cfg.prompt });

  // Resolve model with fallback: if the requested model's provider key
  // is missing, fall back to whichever provider IS configured.
  let model = cfg.model || "claude-sonnet-4-6";
  if (model.startsWith("claude-") && !process.env.ANTHROPIC_API_KEY) {
    if (process.env.OPENAI_API_KEY) {
      model = "gpt-4o-mini";
      console.warn(`[workflow] ANTHROPIC_API_KEY missing, falling back to ${model}`);
    }
  } else if (model.startsWith("gpt-") && !process.env.OPENAI_API_KEY) {
    if (process.env.ANTHROPIC_API_KEY) {
      model = "claude-sonnet-4-6";
      console.warn(`[workflow] OPENAI_API_KEY missing, falling back to ${model}`);
    }
  }

  // Floor at 2000 tokens — anything less risks truncated output for
  // real documents (DD checklists, analysis reports, etc.). Configured
  // values above 2000 are honored as-is.
  const requestedTokens = Number(cfg.max_tokens) || 4000;
  const maxTokens = Math.max(requestedTokens, 2000);

  const result = await llmComplete({
    model,
    messages,
    maxTokens,
    feature: "workflow.openai_node",
  });
  return { text: result.message.content ?? "", raw: result.raw };
}

async function runQueryClients(
  cfg: { filter?: Record<string, string>; limit?: number; order_by?: string },
  workspaceId: string
) {
  let q = supabaseAdmin
    .from("contacts")
    .select("id, name, email, phone, created_at")
    .eq("workspace_id", workspaceId);

  // Filter values support operator prefixes for comparison queries:
  //   "gte:2026-05-16T00:00:00Z"  → .gte("created_at", "2026-05-16...")
  //   "lte:2026-05-16"            → .lte(...)
  //   "gt:5"                      → .gt(...)
  //   "lt:5"                      → .lt(...)
  //   "neq:inactive"              → .neq(...)
  //   "like:%smith%"              → .like(...)
  //   "ilike:%smith%"             → .ilike(...)
  //   no prefix                   → .eq(...) (backwards compatible)
  //
  // Skip empty filter values — resolveTemplate() turns unresolved
  // `{{steps.x.y}}` into empty strings, and Postgres rejects
  // `WHERE created_at = ''` with a 22007 error. Treating "" as
  // "don't filter" is the right default — no value means "any".
  for (const [k, v] of Object.entries(cfg.filter || {})) {
    if (v === "" || v === null || v === undefined) continue;
    const sv = String(v);

    const opMatch = sv.match(/^(gte|lte|gt|lt|neq|like|ilike):(.+)$/);
    if (opMatch) {
      const [, op, val] = opMatch;
      switch (op) {
        case "gte":   q = q.gte(k, val); break;
        case "lte":   q = q.lte(k, val); break;
        case "gt":    q = q.gt(k, val); break;
        case "lt":    q = q.lt(k, val); break;
        case "neq":   q = q.neq(k, val); break;
        case "like":  q = q.like(k, val); break;
        case "ilike": q = q.ilike(k, val); break;
      }
    } else {
      q = q.eq(k, sv);
    }
  }
  const limit = Math.min(Math.max(Number(cfg.limit) || 25, 1), 500);
  q = q.order("created_at", { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { contacts: data || [], count: data?.length ?? 0 };
}

async function runQueryProperties(
  cfg: { filter?: Record<string, string>; limit?: number },
  workspaceId: string
) {
  let q = supabaseAdmin
    .from("properties")
    .select("id, name, address_line1, city, state, zip, transaction_stage, stage_entered_at, expected_close_date, lease_end_date, monthly_rent_cents, tenant_contact_id, year_built, lot_size_sqft")
    .eq("workspace_id", workspaceId);

  for (const [k, v] of Object.entries(cfg.filter || {})) {
    if (v === "" || v === null || v === undefined) continue;
    const sv = String(v);
    const opMatch = sv.match(/^(gte|lte|gt|lt|neq|like|ilike):(.+)$/);
    if (opMatch) {
      const [, op, val] = opMatch;
      switch (op) {
        case "gte":   q = q.gte(k, val); break;
        case "lte":   q = q.lte(k, val); break;
        case "gt":    q = q.gt(k, val); break;
        case "lt":    q = q.lt(k, val); break;
        case "neq":   q = q.neq(k, val); break;
        case "like":  q = q.like(k, val); break;
        case "ilike": q = q.ilike(k, val); break;
      }
    } else {
      q = q.eq(k, sv);
    }
  }
  const limit = Math.min(Math.max(Number(cfg.limit) || 25, 1), 500);
  q = q.order("stage_entered_at", { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { properties: data || [], count: data?.length ?? 0 };
}

async function runQueryListings(
  cfg: { filter?: Record<string, string>; limit?: number },
  workspaceId: string
) {
  let q = supabaseAdmin
    .from("re_listings")
    .select("id, property_id, list_price_cents, list_date, expires_on, agency_type, commission_pct, status, notes")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  for (const [k, v] of Object.entries(cfg.filter || {})) {
    if (v === "" || v === null || v === undefined) continue;
    const sv = String(v);
    const opMatch = sv.match(/^(gte|lte|gt|lt|neq|like|ilike):(.+)$/);
    if (opMatch) {
      const [, op, val] = opMatch;
      switch (op) {
        case "gte":   q = q.gte(k, val); break;
        case "lte":   q = q.lte(k, val); break;
        case "gt":    q = q.gt(k, val); break;
        case "lt":    q = q.lt(k, val); break;
        case "neq":   q = q.neq(k, val); break;
        case "like":  q = q.like(k, val); break;
        case "ilike": q = q.ilike(k, val); break;
      }
    } else {
      q = q.eq(k, sv);
    }
  }
  const limit = Math.min(Math.max(Number(cfg.limit) || 25, 1), 500);
  q = q.order("list_date", { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { listings: data || [], count: data?.length ?? 0 };
}

async function runQueryOffers(
  cfg: { filter?: Record<string, string>; limit?: number },
  workspaceId: string
) {
  let q = supabaseAdmin
    .from("re_offers")
    .select("id, property_id, listing_id, buyer_contact_id, offer_price_cents, earnest_money_cents, contingencies, expires_at, closing_target, status, notes")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  for (const [k, v] of Object.entries(cfg.filter || {})) {
    if (v === "" || v === null || v === undefined) continue;
    const sv = String(v);
    const opMatch = sv.match(/^(gte|lte|gt|lt|neq|like|ilike):(.+)$/);
    if (opMatch) {
      const [, op, val] = opMatch;
      switch (op) {
        case "gte":   q = q.gte(k, val); break;
        case "lte":   q = q.lte(k, val); break;
        case "gt":    q = q.gt(k, val); break;
        case "lt":    q = q.lt(k, val); break;
        case "neq":   q = q.neq(k, val); break;
        case "like":  q = q.like(k, val); break;
        case "ilike": q = q.ilike(k, val); break;
      }
    } else {
      q = q.eq(k, sv);
    }
  }
  const limit = Math.min(Math.max(Number(cfg.limit) || 25, 1), 500);
  q = q.order("created_at", { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { offers: data || [], count: data?.length ?? 0 };
}

async function runLeaseLookup(
  cfg: { property_id?: string; status?: string; limit?: number },
  workspaceId: string
) {
  let q = supabaseAdmin
    .from("lease_abstracts")
    .select("id, vault_item_id, status, fields, context_analysis, created_at")
    .eq("workspace_id", workspaceId);

  if (cfg.status) q = q.eq("status", cfg.status);
  const limit = Math.min(Math.max(Number(cfg.limit) || 10, 1), 100);
  q = q.order("created_at", { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const abstracts = (data || []).map((row) => {
    const fields = Array.isArray(row.fields) ? row.fields : [];
    const summary: Record<string, unknown> = {};
    for (const f of fields as Array<{ name: string; value: unknown; confidence: string }>) {
      if (f.value != null && f.confidence !== "not_found") {
        summary[f.name] = f.value;
      }
    }
    return { id: row.id, vault_item_id: row.vault_item_id, status: row.status, terms: summary, created_at: row.created_at };
  });

  return { abstracts, count: abstracts.length };
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

async function runWebSearch(cfg: {
  query: string;
  max_results?: number;
  search_depth?: "basic" | "advanced";
  include_domains?: string[] | string;
  exclude_domains?: string[] | string;
}) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY not configured");
  return withRetry(async () => {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: cfg.query,
        max_results: Math.min(Math.max(Number(cfg.max_results) || 5, 1), 20),
        search_depth: cfg.search_depth || "basic",
        include_domains: toStringArray(cfg.include_domains),
        exclude_domains: toStringArray(cfg.exclude_domains),
        include_answer: true,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Tavily search failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    const results = (data.results || []).map((r: { title: string; url: string; content: string; score: number }) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      score: r.score,
    }));
    return {
      answer: data.answer || null,
      results,
      count: results.length,
      query: cfg.query,
      source_tier: SOURCE_TAGS.web_search,
    };
  }, `web_search "${cfg.query}"`);
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

async function runSendEmail(
  cfg: { to: string; subject: string; html?: string; text?: string },
  workspaceId?: string,
) {
  // Rate limit check (if workspace context is available)
  if (workspaceId) {
    const rl = await checkRateLimit(workspaceId, "email");
    if (!rl.allowed) {
      throw new Error(`Email rate limit exceeded: ${rl.current}/${rl.limit} per hour. Wait for the next hour window.`);
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const from = process.env.RESEND_FROM_EMAIL || "noreply@driftai.studio";

  return withRetry(async () => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: cfg.to, subject: cfg.subject, html: cfg.html, text: cfg.text,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      // 429 = rate limited by Resend, 5xx = server error — both retryable
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Resend ${res.status}: ${json?.message || "server error"}`);
      }
      throw new Error(json?.message || `Resend ${res.status}`);
    }
    return { email_id: json.id, to: cfg.to };
  }, `send_email to ${cfg.to}`);
}

// SMS / iMessage delivery via SendBlue. Returns the delivery channel
// SendBlue actually used (iMessage if the recipient is on Apple,
// otherwise green-bubble SMS) so the audit log records what was
// actually sent — not just what was attempted.
//
// Recipient resolution: exactly one of to_phone | to_role | to_member_id.
//   - to_phone: send to that one number (legacy shape, backwards-compat).
//   - to_role: fan out to every workspace member whose role matches
//     AND who has a verified phone. Members without a phone get logged
//     into `skipped[]` instead of erroring.
//   - to_member_id: target one specific teammate by profile id.
interface SmsRecipient {
  phone: string;
  member_id?: string;
  member_name?: string | null;
}
interface SmsSkipped {
  member_id: string;
  reason: string;
  name?: string | null;
}

async function resolveSmsRecipients(
  cfg: {
    to_phone?: string;
    to_role?: "owner" | "admin" | "member" | "all";
    to_member_id?: string;
  },
  workspaceId: string,
): Promise<{ recipients: SmsRecipient[]; skipped: SmsSkipped[] }> {
  const recipients: SmsRecipient[] = [];
  const skipped: SmsSkipped[] = [];

  if (cfg.to_member_id) {
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, sms_phone, sms_verified_at, workspace_id")
      .eq("id", cfg.to_member_id)
      .maybeSingle();
    const r = row as
      | {
          id: string;
          full_name: string | null;
          sms_phone: string | null;
          sms_verified_at: string | null;
          workspace_id: string | null;
        }
      | null;
    if (!r || r.workspace_id !== workspaceId) {
      throw new Error(
        `send_sms: member ${cfg.to_member_id} not found in workspace`,
      );
    }
    if (r.sms_phone && r.sms_verified_at) {
      recipients.push({
        phone: r.sms_phone,
        member_id: r.id,
        member_name: r.full_name,
      });
    } else {
      skipped.push({
        member_id: r.id,
        name: r.full_name,
        reason: "no_phone_enrolled",
      });
    }
    return { recipients, skipped };
  }
  if (cfg.to_role) {
    let query = supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, sms_phone, sms_verified_at")
      .eq("workspace_id", workspaceId);
    if (cfg.to_role !== "all") {
      query = query.eq("role", cfg.to_role);
    }
    const { data: rows } = await query;
    for (const m of (rows || []) as Array<{
      id: string;
      full_name: string | null;
      role: string;
      sms_phone: string | null;
      sms_verified_at: string | null;
    }>) {
      if (m.sms_phone && m.sms_verified_at) {
        recipients.push({
          phone: m.sms_phone,
          member_id: m.id,
          member_name: m.full_name,
        });
      } else {
        skipped.push({
          member_id: m.id,
          name: m.full_name,
          reason: "no_phone_enrolled",
        });
      }
    }
    return { recipients, skipped };
  }
  throw new Error(
    "send_sms: must specify exactly one of to_phone | to_role | to_member_id",
  );
}

async function runSendSms(
  cfg: {
    to_phone?: string;
    to_role?: "owner" | "admin" | "member" | "all";
    to_member_id?: string;
    body: string;
    from_number?: string;
  },
  workspaceId: string,
) {
  const { sendMessage } = await import("@/lib/sms/sender");
  const { recipients, skipped } = await resolveSmsRecipients(cfg, workspaceId);

  if (recipients.length === 0) {
    return {
      delivered: [] as Array<{
        to_phone: string;
        delivery_channel: string;
        message_id: string;
        member_id?: string;
      }>,
      skipped,
      delivery_channel: null as string | null,
      message_id: null as string | null,
      to_phone: null as string | null,
    };
  }

  // Rate limit check before fanning out
  const rl = await checkRateLimit(workspaceId, "sms", recipients.length);
  if (!rl.allowed) {
    throw new Error(`SMS rate limit exceeded: ${rl.current}/${rl.limit} per hour. ${recipients.length} recipients would exceed the cap.`);
  }

  // Fan out — one HTTP call per recipient. SendBlue is happy to take
  // these in parallel; bound the concurrency at 4 to be polite.
  const results: Array<{
    to_phone: string;
    delivery_channel: string;
    message_id: string | null;
    member_id?: string;
    member_name?: string | null;
  }> = [];
  for (let i = 0; i < recipients.length; i += 4) {
    const slice = recipients.slice(i, i + 4);
    const batch = await Promise.all(
      slice.map(async (rcpt) => {
        try {
          const result = await withRetry(
            () => sendMessage(rcpt.phone, cfg.body, { fromNumber: cfg.from_number }),
            `sms to ${rcpt.phone}`,
          );
          return {
            to_phone: rcpt.phone,
            delivery_channel: result.delivery_channel,
            message_id: result.message_id,
            member_id: rcpt.member_id,
            member_name: rcpt.member_name,
          };
        } catch (err) {
          console.error(`[workflow-runner] SMS to ${rcpt.phone} failed:`, err instanceof Error ? err.message : err);
          return {
            to_phone: rcpt.phone,
            delivery_channel: "failed",
            message_id: null,
            member_id: rcpt.member_id,
            member_name: rcpt.member_name,
          };
        }
      }),
    );
    results.push(...batch);
  }

  // For backwards compatibility with downstream condition steps that
  // template `{{steps.notify.delivery_channel}}` (set up against the
  // single-recipient shape), surface the FIRST delivery's channel +
  // message_id at the top level when there's exactly one recipient.
  const first = results[0];
  return {
    delivered: results,
    skipped,
    delivery_channel: first?.delivery_channel ?? null,
    message_id: first?.message_id ?? null,
    to_phone: first?.to_phone ?? null,
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

// ── Integration + data source handlers ────────────────────────

async function runIntegrationQuery(
  cfg: { provider: string; endpoint: string; method?: string; params?: Record<string, unknown>; headers?: Record<string, string> },
  workspaceId: string,
) {
  if (!cfg.provider) throw new Error("integration_query: provider is required");
  if (!cfg.endpoint) throw new Error("integration_query: endpoint is required");

  const { data: conn } = await supabaseAdmin
    .from("integration_connections")
    .select("credentials")
    .eq("workspace_id", workspaceId)
    .eq("provider", cfg.provider)
    .eq("status", "connected")
    .maybeSingle();

  if (!conn) {
    throw new Error(`No connected ${cfg.provider} integration. Connect it in Settings > Integrations.`);
  }

  const creds = conn.credentials as Record<string, string>;
  const apiKey = creds.api_key || creds.access_token || "";
  const method = (cfg.method || "GET").toUpperCase();

  let url = cfg.endpoint;
  if (method === "GET" && cfg.params && Object.keys(cfg.params).length > 0) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(cfg.params)) qs.set(k, String(v));
    url += (url.includes("?") ? "&" : "?") + qs.toString();
  }

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(cfg.headers || {}),
  };

  const fetchOpts: RequestInit = { method, headers };
  if (method !== "GET" && cfg.params) {
    fetchOpts.body = JSON.stringify(cfg.params);
  }

  return withRetry(async () => {
    const res = await fetch(url, fetchOpts);
    if (res.status >= 500) {
      const text = await res.text().catch(() => "");
      throw new Error(`${cfg.provider} ${res.status}: ${text.slice(0, 200)}`);
    }
    const body = await res.json().catch(() => res.text());
    return {
      status: res.status,
      ok: res.ok,
      body,
      provider: cfg.provider,
      source_tier: { tier: 2 as const, source: `${cfg.provider} API` } satisfies SourceTag,
    };
  }, `integration ${cfg.provider} ${method} ${cfg.endpoint}`);
}

async function runDueDiligence(
  cfg: {
    address?: string;
    latitude?: number;
    longitude?: number;
    state_fips?: string;
    county_fips?: string;
    tract_fips?: string;
    county_name?: string;
    drive_time_destinations?: string[] | string;
  },
  workspaceId: string,
) {
  const { fetchAcsByTract, fetchAcsByCounty } = await import("@/lib/data-sources/census");
  const { fetchEmployment } = await import("@/lib/data-sources/bls");
  const { queryFloodZone } = await import("@/lib/data-sources/fema-flood");
  const { queryToxicsFacilities, querySuperfundSites } = await import("@/lib/data-sources/epa");
  const { geocodeAddress, reverseGeocode, nearbyPlaces, distanceMatrix } = await import("@/lib/data-sources/google-maps");

  // ── Resolve Google Maps API key ──
  const gmapsKey = await resolveGoogleMapsKey(workspaceId);

  // ── Geocode: address -> coordinates + FIPS ──
  let lat = cfg.latitude ? Number(cfg.latitude) : 0;
  let lng = cfg.longitude ? Number(cfg.longitude) : 0;
  let stateFips = cfg.state_fips || "";
  let countyFips = cfg.county_fips || "";
  let countyName = cfg.county_name || "";
  let geocoded: Awaited<ReturnType<typeof geocodeAddress>> = null;

  if (cfg.address && gmapsKey) {
    // Google Maps geocoding (best: returns FIPS, formatted address)
    geocoded = await geocodeAddress(cfg.address, gmapsKey);
    if (geocoded) {
      lat = geocoded.latitude;
      lng = geocoded.longitude;
      if (!stateFips && geocoded.address_components.state_fips) {
        stateFips = geocoded.address_components.state_fips;
      }
      if (!countyName && geocoded.address_components.county) {
        countyName = geocoded.address_components.county.toUpperCase();
      }
    }
  } else if (cfg.address && !gmapsKey) {
    // Nominatim fallback (free, no API key needed) — gets lat/lng +
    // state/county name. Then Census Bureau geocoder resolves the FIPS
    // codes from coordinates (also free, no key).
    const { geocodeAddress: nominatimGeocode, getCensusFips } = await import("@/lib/site-scan/enrichment/geocoder");
    const { STATE_ABBR_TO_FIPS } = await import("@/lib/data-sources/google-maps");
    const nom = await nominatimGeocode(cfg.address);
    if (nom) {
      lat = nom.lat;
      lng = nom.lng;
      countyName = nom.county.toUpperCase();
      if (!stateFips && nom.state) {
        stateFips = STATE_ABBR_TO_FIPS[nom.state] || "";
      }
      // Resolve county FIPS from Census Bureau (Nominatim doesn't provide it)
      if (!countyFips) {
        const censusFips = await getCensusFips(nom.lat, nom.lng);
        if (censusFips.countyFips) countyFips = censusFips.countyFips;
        if (censusFips.stateFips && !stateFips) stateFips = censusFips.stateFips;
      }
      // Build a geocoded-like object for the output
      geocoded = {
        formatted_address: nom.matched_address,
        latitude: nom.lat,
        longitude: nom.lng,
        address_components: {
          state: nom.state,
          state_fips: stateFips,
          county: nom.county,
        },
      } as Awaited<ReturnType<typeof geocodeAddress>>;
    }
  } else if (lat && lng && !cfg.address && gmapsKey) {
    // Reverse geocode to get formatted address + fill missing FIPS
    geocoded = await reverseGeocode(lat, lng, gmapsKey);
    if (geocoded) {
      if (!stateFips && geocoded.address_components.state_fips) {
        stateFips = geocoded.address_components.state_fips;
      }
      if (!countyName && geocoded.address_components.county) {
        countyName = geocoded.address_components.county.toUpperCase();
      }
    }
  }

  if (!lat || !lng) {
    throw new Error("due_diligence: address could not be geocoded, or provide latitude/longitude directly");
  }

  // ── Government data sources (parallel) ──
  const govFetches = Promise.allSettled([
    stateFips && countyFips
      ? (cfg.tract_fips
          ? fetchAcsByTract(stateFips, countyFips, cfg.tract_fips)
          : fetchAcsByCounty(stateFips, countyFips))
      : Promise.resolve(null),
    stateFips && countyFips
      ? fetchEmployment(stateFips + countyFips)
      : Promise.resolve([]),
    queryFloodZone(lat, lng),
    queryToxicsFacilities(lat, lng, 3, { stateFips, countyName }),
    querySuperfundSites(stateFips),
  ]);

  // ── Google Maps data (parallel with gov data) ──
  const dests = Array.isArray(cfg.drive_time_destinations)
    ? cfg.drive_time_destinations
    : typeof cfg.drive_time_destinations === "string"
      ? cfg.drive_time_destinations.split(",").map((d) => d.trim()).filter(Boolean)
      : [];
  const mapsFetches = gmapsKey
    ? Promise.allSettled([
        nearbyPlaces(lat, lng, gmapsKey),
        dests.length
          ? distanceMatrix(lat, lng, dests, gmapsKey)
          : Promise.resolve([]),
      ])
    : Promise.resolve(null);

  const [govResults, mapsResults] = await Promise.all([govFetches, mapsFetches]);

  const val = (i: number) => govResults[i].status === "fulfilled" ? (govResults[i] as PromiseFulfilledResult<unknown>).value : null;
  const err = (i: number) => govResults[i].status === "rejected" ? String((govResults[i] as PromiseRejectedResult).reason) : null;

  const errors: string[] = [];
  if (err(0)) errors.push(`census: ${err(0)}`);
  if (err(1)) errors.push(`bls: ${err(1)}`);
  if (err(2)) errors.push(`fema: ${err(2)}`);
  if (err(3)) errors.push(`epa_toxics: ${err(3)}`);
  if (err(4)) errors.push(`epa_superfund: ${err(4)}`);

  // Extract maps data
  let nearby: unknown = null;
  let driveTimes: unknown = null;
  if (Array.isArray(mapsResults)) {
    const mVal = (i: number) => mapsResults[i]?.status === "fulfilled" ? (mapsResults[i] as PromiseFulfilledResult<unknown>).value : null;
    const mErr = (i: number) => mapsResults[i]?.status === "rejected" ? String((mapsResults[i] as PromiseRejectedResult).reason) : null;
    nearby = mVal(0);
    driveTimes = mVal(1);
    if (mErr(0)) errors.push(`google_places: ${mErr(0)}`);
    if (mErr(1)) errors.push(`google_distance: ${mErr(1)}`);
  }

  return {
    location: geocoded ? {
      formatted_address: geocoded.formatted_address,
      latitude: lat,
      longitude: lng,
      county: countyName,
      state: geocoded.address_components.state,
      state_fips: stateFips,
      county_fips: countyFips,
    } : {
      latitude: lat,
      longitude: lng,
      state_fips: stateFips,
      county_fips: countyFips,
      county: countyName || null,
    },
    census: val(0),
    employment: val(1),
    flood_zone: val(2),
    epa: {
      toxics_facilities: val(3),
      superfund_sites: val(4),
    },
    nearby_places: nearby,
    drive_times: driveTimes,
    errors,
    source_tiers: {
      census: SOURCE_TAGS.census,
      employment: SOURCE_TAGS.bls,
      flood_zone: SOURCE_TAGS.fema,
      epa_toxics: SOURCE_TAGS.epa_tri,
      epa_superfund: SOURCE_TAGS.epa_superfund,
      nearby_places: SOURCE_TAGS.google_places,
      drive_times: SOURCE_TAGS.google_distance,
      geocoding: gmapsKey ? SOURCE_TAGS.google_places : SOURCE_TAGS.nominatim,
    },
  };
}

/** Resolve Google Maps API key from integration_connections or env var */
async function resolveGoogleMapsKey(workspaceId: string): Promise<string | null> {
  // 1. Try workspace integration connection
  try {
    const { data: conn } = await supabaseAdmin
      .from("integration_connections")
      .select("credentials")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google_maps")
      .eq("status", "connected")
      .maybeSingle();
    if (conn) {
      const creds = conn.credentials as Record<string, string>;
      if (creds.api_key) return creds.api_key;
    }
  } catch { /* fall through */ }

  // 2. Try env var (platform-level fallback)
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY;

  return null;
}

/** Format a section body for PDF output. If the value is a JSON array
 *  of objects (common when templates resolve structured data), render
 *  it as a human-readable bullet list instead of raw JSON. */
function formatSectionBody(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) return trimmed;

  let parsed: unknown[];
  try { parsed = JSON.parse(trimmed); } catch { return trimmed; }
  if (!Array.isArray(parsed)) return trimmed;

  // Array of objects: render as a line-per-item summary
  return parsed.map((item, i) => {
    if (typeof item !== "object" || item === null) return String(item);
    const obj = item as Record<string, unknown>;

    // Try to find human-readable fields and build a one-liner
    const name = obj.facility_name || obj.site_name || obj.name || obj.title || "";
    const city = obj.city || obj.city_name || "";
    const dist = obj.distance_miles != null ? `${obj.distance_miles} mi` : "";
    const period = obj.period || "";
    const year = obj.year || "";
    const rate = obj.unemployment_rate != null ? `${obj.unemployment_rate}% unemployment` : "";
    const emp = obj.total_employment != null ? `${Number(obj.total_employment).toLocaleString()} employed` : "";
    const vicinity = obj.vicinity || "";
    const distMeters = obj.distance_meters != null ? `${(Number(obj.distance_meters) / 1609.34).toFixed(1)} mi` : "";
    const rating = obj.rating != null ? `${obj.rating}/5` : "";
    const placeType = obj.type || "";

    // Nearby places format (Google Maps)
    if (name && (vicinity || distMeters)) {
      const parts = [name, vicinity || city, distMeters || dist, rating].filter(Boolean);
      const prefix = placeType ? `[${String(placeType).replace(/_/g, " ")}] ` : "";
      return `${i + 1}. ${prefix}${parts.join(" - ")}`;
    }

    // TRI/facility format
    if (name && (city || dist)) {
      const parts = [name, city, dist].filter(Boolean);
      return `${i + 1}. ${parts.join(" - ")}`;
    }

    // Drive time format
    const destination = obj.destination || "";
    const duration = obj.duration_text || "";
    const distText = obj.distance_text || "";
    if (destination && duration) {
      return `${destination}: ${duration} (${distText})`;
    }

    if (year && period) {
      const parts = [`${year} ${period}`, rate, emp].filter(Boolean);
      return parts.join(" | ");
    }

    // Fallback: key=value pairs, skip internal IDs
    const skip = new Set(["registry_id", "handler_id", "series_id", "area_code"]);
    const pairs = Object.entries(obj)
      .filter(([k]) => !skip.has(k))
      .map(([k, v]) => `${k}: ${v}`)
      .slice(0, 6);
    return `${i + 1}. ${pairs.join(", ")}`;
  }).join("\n");
}

async function runGenerateDocument(
  cfg: { title: string; subtitle?: string; sections: Array<{ heading: string; body: string }> },
  workspaceId: string,
  runId: string,
) {
  const { renderBrandedReport } = await import("@/lib/pdf/render");

  const title = String(cfg.title || "Untitled Report");
  const sections = Array.isArray(cfg.sections) ? cfg.sections : [];

  const buffer = await renderBrandedReport({
    workspaceId,
    title,
    subtitle: cfg.subtitle || undefined,
    sections: sections.map((s) => ({
      heading: String(s.heading || ""),
      body: formatSectionBody(String(s.body || "")),
    })),
  });

  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const path = `workflows/${workspaceId}/${runId}/${slug}.pdf`;

  let url: string | null = null;
  try {
    const { error: uploadErr } = await supabaseAdmin.storage.from("dante-archive").upload(path, buf, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (!uploadErr) {
      const { data: signed } = await supabaseAdmin.storage
        .from("dante-archive")
        .createSignedUrl(path, 86400);
      url = signed?.signedUrl || null;
    }
  } catch {
    // storage upload is best-effort
  }

  return {
    url,
    storage_path: path,
    size_bytes: buf.byteLength,
    filename: `${slug}.pdf`,
  };
}

const FOR_EACH_MAX_ITEMS = 200;

async function runForEach(
  cfg: { items: string; action_type: string; action_config: Record<string, unknown> },
  ctx: Ctx,
  workspaceId: string,
  runId: string,
) {
  let items: unknown[];
  const raw = cfg.items;
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === "string") {
    try { items = JSON.parse(raw); } catch { items = []; }
  } else {
    items = [];
  }

  if (!Array.isArray(items)) items = [];

  // Hard iteration cap — prevents runaway loops from sending
  // thousands of emails or hammering external APIs.
  const originalCount = items.length;
  if (items.length > FOR_EACH_MAX_ITEMS) {
    console.warn(`[workflow-runner] for_each capped: ${items.length} items truncated to ${FOR_EACH_MAX_ITEMS}`);
    items = items.slice(0, FOR_EACH_MAX_ITEMS);
  }

  // Pre-check rate limits for send actions before starting the loop
  if (cfg.action_type === "send_email" && items.length > 0) {
    const rl = await checkRateLimit(workspaceId, "email", items.length);
    if (!rl.allowed) {
      throw new Error(`for_each would send ${items.length} emails but rate limit is ${rl.limit}/hour (currently at ${rl.current - items.length}). Reduce the list or wait.`);
    }
  }
  if (cfg.action_type === "send_sms" && items.length > 0) {
    const rl = await checkRateLimit(workspaceId, "sms", items.length);
    if (!rl.allowed) {
      throw new Error(`for_each would send ${items.length} SMS but rate limit is ${rl.limit}/hour (currently at ${rl.current - items.length}). Reduce the list or wait.`);
    }
  }

  const results: Array<{ index: number; status: "ok" | "error"; data?: unknown; error?: string }> = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    ctx.steps["__foreach_item__"] = item;

    const resolvedConfig = resolveTemplate(cfg.action_config, ctx) as Record<string, unknown>;

    try {
      let result: unknown;
      switch (cfg.action_type) {
        case "send_email": {
          // Pre-flight recipient validation (same as graph handler).
          const batchTo = typeof resolvedConfig.to === "string" ? (resolvedConfig.to as string).trim() : "";
          if (!batchTo) {
            throw new Error(
              "send_email: 'to' field is empty. A {{secrets.*}} template may not be configured.",
            );
          }
          const batchEmailPart = batchTo.includes("<")
            ? (batchTo.match(/<([^>]+)>/)?.[1] ?? "")
            : batchTo;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(batchEmailPart)) {
            throw new Error(
              `send_email: invalid recipient '${batchTo}'.`,
            );
          }
          if (ctx.simulate) {
            result = { simulated: true, would_have: { action: "send_email", to: resolvedConfig.to } };
          } else {
            result = await runSendEmail(resolvedConfig as Parameters<typeof runSendEmail>[0]);
          }
          break;
        }
        case "update_contact":
          if (ctx.simulate) {
            result = { simulated: true, would_have: { action: "update_contact", contact_id: resolvedConfig.contact_id } };
          } else {
            result = await runUpdateContact(resolvedConfig as Parameters<typeof runUpdateContact>[0], workspaceId);
          }
          break;
        case "http":
          if (ctx.simulate && resolvedConfig.method && String(resolvedConfig.method).toUpperCase() !== "GET") {
            result = { simulated: true, would_have: { action: "http", method: resolvedConfig.method, url: resolvedConfig.url } };
          } else {
            result = await runHttp(resolvedConfig as Parameters<typeof runHttp>[0]);
          }
          break;
        case "send_sms":
          if (ctx.simulate) {
            result = { simulated: true, would_have: { action: "send_sms", body: String(resolvedConfig.body || "").slice(0, 100) } };
          } else {
            result = await runSendSms(resolvedConfig as Parameters<typeof runSendSms>[0], workspaceId);
          }
          break;
        case "generate_document":
          if (ctx.simulate) {
            result = { simulated: true, would_have: { action: "generate_document", title: resolvedConfig.title } };
          } else {
            result = await runGenerateDocument(resolvedConfig as Parameters<typeof runGenerateDocument>[0], workspaceId, runId);
          }
          break;
        case "integration_query":
          result = await runIntegrationQuery(resolvedConfig as Parameters<typeof runIntegrationQuery>[0], workspaceId);
          break;
        default:
          throw new Error(`for_each: unsupported action_type "${cfg.action_type}"`);
      }
      results.push({ index: i, status: "ok", data: result });
      succeeded++;
    } catch (err) {
      results.push({ index: i, status: "error", error: err instanceof Error ? err.message : String(err) });
      failed++;
    }
  }

  delete ctx.steps["__foreach_item__"];

  return {
    results,
    total: items.length,
    succeeded,
    failed,
    ...(originalCount > FOR_EACH_MAX_ITEMS && {
      truncated: true,
      original_count: originalCount,
      cap: FOR_EACH_MAX_ITEMS,
    }),
  };
}

async function runApproval(
  cfg: { message: string; approver_role?: string; timeout_hours?: number },
  workspaceId: string,
  runId: string,
): Promise<Record<string, unknown>> {
  const { supabaseAdmin: sb } = await import("@/lib/supabase/admin");
  const expiresAt = new Date(Date.now() + (cfg.timeout_hours || 72) * 3600_000).toISOString();

  const tokens: Record<string, string> = {};
  for (const action of ["approve", "reject"] as const) {
    const { data } = await sb
      .from("dante_approval_tokens")
      .insert({
        run_id: runId,
        workspace_id: workspaceId,
        action,
        expires_at: expiresAt,
      })
      .select("token")
      .single();
    tokens[action] = data?.token ?? "";
  }

  return {
    __approval_pause: true,
    message: cfg.message,
    approver_role: cfg.approver_role || "any",
    timeout_hours: cfg.timeout_hours || 72,
    approve_token: tokens.approve,
    reject_token: tokens.reject,
  };
}

function runTransform(
  cfg: { operations: Array<{ action: string; field: string; value?: unknown; from?: string }> },
  ctx: Ctx,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const op of cfg.operations || []) {
    switch (op.action) {
      case "set":
        result[op.field] = op.value;
        break;
      case "rename":
        if (op.from) {
          const parts = op.from.split(".");
          let val: unknown = ctx.steps;
          for (const p of parts) val = (val as Record<string, unknown>)?.[p];
          result[op.field] = val;
        }
        break;
      case "delete":
        result[op.field] = undefined;
        break;
      case "expression": {
        const expr = String(op.value ?? "");
        try {
          result[op.field] = JSON.parse(expr);
        } catch {
          result[op.field] = expr;
        }
        break;
      }
    }
  }
  return result;
}

function runSwitch(
  cfg: { expression: string; cases: Array<{ value: string; label?: string }>; default_case?: string },
): { expression: string; matched_case: string; matched_index: number } {
  const val = String(cfg.expression ?? "").trim();
  for (let i = 0; i < (cfg.cases || []).length; i++) {
    if (val === cfg.cases[i].value) {
      return { expression: val, matched_case: cfg.cases[i].value, matched_index: i };
    }
  }
  return { expression: val, matched_case: cfg.default_case || "__default__", matched_index: -1 };
}

async function runSubWorkflow(
  cfg: { workflow_id: string; input: Record<string, unknown> },
  workspaceId: string,
  parentRunId: string,
): Promise<Record<string, unknown>> {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const { data: wfRow } = await supabaseAdmin
    .from("dante_workflows")
    .select("*")
    .eq("id", cfg.workflow_id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!wfRow) throw new Error(`Sub-workflow ${cfg.workflow_id} not found`);

  const { definitionFromRow } = await import("./workflow-types");
  const def = definitionFromRow(wfRow);
  const result = await runWorkflow(def, cfg.input || {}, {
    runId: `${parentRunId}_sub_${Date.now().toString(36)}`,
  });

  return {
    status: result.status,
    output: result.output,
    log_entries: result.log.length,
    error: result.error,
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
    case "trigger_at":
    case "trigger_webhook":
    case "trigger_lease_expiry":
    case "trigger_deal_stage":
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

      // Pre-flight: validate recipient before hitting the mail API.
      // Common failure: {{secrets.broker_email}} resolves to "" when
      // the secret hasn't been set, producing a confusing Resend error.
      const toAddr = typeof emailCfg.to === "string" ? emailCfg.to.trim() : "";
      if (!toAddr) {
        throw new Error(
          "send_email: 'to' field is empty. This usually means a " +
          "{{secrets.*}} template (e.g. {{secrets.broker_email}}) has " +
          "not been configured. Ask Dante to set the secret, or add it " +
          "in Settings > Workflow Secrets.",
        );
      }
      // Basic RFC 5322 check — must contain @ with text on both sides.
      // Supports "Name <email>" format too.
      const emailPart = toAddr.includes("<")
        ? (toAddr.match(/<([^>]+)>/)?.[1] ?? "")
        : toAddr;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPart)) {
        throw new Error(
          `send_email: invalid recipient '${toAddr}'. The email address ` +
          "must follow the 'email@example.com' or 'Name <email@example.com>' format.",
        );
      }

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
      return runSendEmail(emailCfg, workspaceId);
    }
    case "send_sms": {
      const smsCfg = cfg as Parameters<typeof runSendSms>[0];
      if (ctx.simulate) {
        const previewBody =
          typeof smsCfg.body === "string" ? smsCfg.body.slice(0, 400) : "";
        // Resolve the recipient list WITHOUT sending so the run
        // timeline shows "would_have texted Adharsh, Luca, …"
        // instead of the raw role selector. Falls back gracefully
        // on lookup errors.
        let resolved;
        try {
          resolved = await resolveSmsRecipients(smsCfg, workspaceId);
        } catch (err) {
          return {
            simulated: true,
            would_have: {
              action: "send_sms",
              ...smsCfg,
              body_preview: previewBody,
              error:
                err instanceof Error ? err.message : "recipient resolve failed",
            },
          };
        }
        return {
          simulated: true,
          would_have: {
            action: "send_sms",
            to_phone: smsCfg.to_phone,
            to_role: smsCfg.to_role,
            to_member_id: smsCfg.to_member_id,
            body_preview: previewBody,
            recipients: resolved.recipients.map((r) => ({
              to_phone: r.phone,
              member_id: r.member_id,
              member_name: r.member_name,
            })),
            skipped: resolved.skipped,
          },
        };
      }
      return runSendSms(smsCfg, workspaceId);
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
      // Inject the no-emoji rule into the agent's system prompt.
      if (typeof cfg.system === "string") {
        cfg.system = cfg.system + NO_EMOJI_SUFFIX;
      }
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
    case "query_properties":
      return runQueryProperties(cfg as Parameters<typeof runQueryProperties>[0], workspaceId);
    case "query_listings":
      return runQueryListings(cfg as Parameters<typeof runQueryListings>[0], workspaceId);
    case "query_offers":
      return runQueryOffers(cfg as Parameters<typeof runQueryOffers>[0], workspaceId);
    case "lease_lookup":
      return runLeaseLookup(cfg as Parameters<typeof runLeaseLookup>[0], workspaceId);
    case "web_search":
      return runWebSearch(cfg as Parameters<typeof runWebSearch>[0]);
    case "integration_query": {
      if (ctx.simulate) {
        return { simulated: true, would_have: { action: "integration_query", provider: cfg.provider, endpoint: cfg.endpoint, method: cfg.method || "GET" } };
      }
      return runIntegrationQuery(cfg as Parameters<typeof runIntegrationQuery>[0], workspaceId);
    }
    case "due_diligence":
      return runDueDiligence(cfg as Parameters<typeof runDueDiligence>[0], workspaceId);
    case "generate_document": {
      if (ctx.simulate) {
        return { simulated: true, would_have: { action: "generate_document", title: cfg.title, sections: Array.isArray(cfg.sections) ? cfg.sections.length : 0 } };
      }
      return runGenerateDocument(cfg as Parameters<typeof runGenerateDocument>[0], workspaceId, runId);
    }
    case "for_each": {
      if (ctx.simulate) {
        const items = typeof cfg.items === "string" ? JSON.parse(cfg.items) : cfg.items;
        return { simulated: true, would_have: { action: "for_each", action_type: cfg.action_type, item_count: Array.isArray(items) ? items.length : "unknown" } };
      }
      return runForEach(cfg as Parameters<typeof runForEach>[0], ctx, workspaceId, runId);
    }
    case "approval": {
      if (ctx.simulate) {
        return { simulated: true, would_have: { action: "approval", message: cfg.message, approver_role: cfg.approver_role || "any" } };
      }
      return runApproval(cfg as Parameters<typeof runApproval>[0], workspaceId, runId);
    }
    case "transform":
      return runTransform(cfg as Parameters<typeof runTransform>[0], ctx);
    case "switch":
      return runSwitch(cfg as Parameters<typeof runSwitch>[0]);
    case "sub_workflow": {
      if (ctx.simulate) {
        return { simulated: true, would_have: { action: "sub_workflow", workflow_id: cfg.workflow_id } };
      }
      return runSubWorkflow(cfg as Parameters<typeof runSubWorkflow>[0], workspaceId, runId);
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

  if (nodeType === "switch") {
    const matched = (output as { matched_case: string })?.matched_case ?? "__default__";
    const matched_edges = outgoing.filter((e) => e.sourceHandle === matched);
    if (matched_edges.length > 0) return matched_edges.map((e) => e.target);
    return outgoing.filter((e) => e.sourceHandle === "__default__").map((e) => e.target);
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
  // Real run IDs are UUIDs from Supabase (have dashes). Synthetic
  // test IDs start with "run_" — skip cancellation checks for those.
  const isRealRun = runId.includes("-");

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (fired.has(id)) continue;
    const node = nodeById.get(id);
    if (!node) continue;

    // Check for mid-execution cancellation every 3 nodes.
    // One extra DB query per 3 nodes is negligible vs node execution
    // time, and lets cancel take effect within seconds.
    if (isRealRun && fired.size > 0 && fired.size % 3 === 0) {
      try {
        if (await isRunCancelled(runId)) {
          return {
            status: "cancelled" as WorkflowRunResult["status"],
            log,
            output: redactSecrets(ctx.steps, secrets),
            error: "Run was cancelled by user",
          };
        }
      } catch { /* DB check failed -- keep going */ }
    }

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

      if (
        output &&
        typeof output === "object" &&
        (output as Record<string, unknown>).__approval_pause === true
      ) {
        return {
          status: "waiting_approval",
          log,
          output: redactSecrets(ctx.steps, secrets),
          paused_at_node: step.id,
          approval_context: ctx.steps as Record<string, unknown>,
        };
      }
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

export async function resumeWorkflow(
  workflow: WorkflowDefinition,
  pausedAtNode: string,
  approvalContext: Record<string, unknown>,
  approvalResult: { action: "approve" | "reject"; reason?: string },
  options: { runId?: string } = {},
): Promise<WorkflowRunResult> {
  const runId = options.runId || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const secrets = await loadWorkspaceSecrets(workflow.workspace_id);
  const ctx: Ctx = {
    input: (approvalContext as Record<string, Record<string, unknown>>)?.trigger?.input as Record<string, unknown> ?? {},
    steps: approvalContext,
    secrets,
    simulate: false,
  };
  ctx.steps[pausedAtNode] = {
    ...(ctx.steps[pausedAtNode] as Record<string, unknown> ?? {}),
    approved: approvalResult.action === "approve",
    action: approvalResult.action,
    reason: approvalResult.reason,
  };

  const log: StepLogEntry[] = [];
  const { nodes, edges } = workflow.graph;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  if (approvalResult.action === "reject") {
    return {
      status: "error",
      log,
      output: redactSecrets(ctx.steps, secrets),
      error: `Approval rejected${approvalResult.reason ? `: ${approvalResult.reason}` : ""}`,
    };
  }

  const fired = new Set<string>();
  for (const key of Object.keys(approvalContext)) {
    fired.add(key);
  }

  const nexts = edges.filter((e) => e.source === pausedAtNode).map((e) => e.target);
  const queue = nexts.filter((n) => !fired.has(n));

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
        output: redactSecrets(output, secrets),
      });

      if (
        output &&
        typeof output === "object" &&
        (output as Record<string, unknown>).__approval_pause === true
      ) {
        return {
          status: "waiting_approval",
          log,
          output: redactSecrets(ctx.steps, secrets),
          paused_at_node: step.id,
          approval_context: ctx.steps as Record<string, unknown>,
        };
      }
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
      ctx.steps[step.id] = { error: message };
    }

    const nextIds = errored
      ? edges.filter((e) => e.source === id).map((e) => e.target)
      : nextNodeIds(id, step.type, output, edges);
    for (const n of nextIds) if (!fired.has(n)) queue.push(n);
  }

  return { status: "success", log, output: redactSecrets(ctx.steps, secrets) };
}
