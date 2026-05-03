// lib/dante/briefs.ts
//
// Dante Client Brief generator — the LLM-grounded replacement for the
// hand-tuned 0-100 churn "scoreboard".
//
// The old scorer emitted a number (false precision) plus a bag of
// weighted signals. Advisors don't act on numbers; they act on a
// specific reason. A Brief is that specific reason, produced by a
// small LLM reading the actual notes/appointments/calls/events for
// one contact and citing which row supports each claim.
//
// ── Anti-hallucination gate ──
// We don't trust the LLM to be faithful to the data; we enforce it.
// Every reason in the output must cite a `source_table:source_id`
// that was in the *input* we fed the model. Reasons without valid
// citations are dropped before the brief is stored. If fewer than
// MIN_GROUNDED_REASONS survive, the generator returns null rather
// than storing a half-baked brief. This is the single most important
// thing separating this from a gimmick.
//
// Model: Haiku 4.5 preferred (fast, cheap, great at extraction /
// classification), OpenAI gpt-4o-mini fallback. Same pattern as
// lib/calls/sentiment.ts.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchRecentEvents } from "./churn-events";
import { complete as llmComplete } from "@/lib/llm/client";

// ── Types ─────────────────────────────────────────────────────

export type RiskLevel = "healthy" | "watch" | "act_now" | "critical";

export type SourceTable =
  | "note"
  | "appointment"
  | "call"
  | "churn_event"
  | "email"     // customer_emails — synced via Gmail OAuth (Phase 2)
  | "meeting";  // calendar_events — synced via Google Calendar (Phase 2)

export interface BriefReason {
  /** Plain-English reason, e.g. "Last 3 appointments were no-shows". */
  text: string;
  /** Table the evidence lives in. */
  source_table: SourceTable;
  /** Row id in that table — must have been provided to the model. */
  source_id: string;
  /** Optional short quote/excerpt pulled from that row. */
  source_excerpt?: string;
}

export interface Brief {
  contact_id: string;
  workspace_id: string;
  risk_level: RiskLevel;
  headline: string;
  reasons: BriefReason[];
  recommended_action: string | null;
  talking_points: string[];
  confidence: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  generated_at: string;
}

// ── Tuning ────────────────────────────────────────────────────

const RECENT_NOTES_LIMIT = 20;
const RECENT_APPTS_LIMIT = 20;
const RECENT_CALLS_LIMIT = 20;
const RECENT_EMAILS_LIMIT = 15;     // skim recent client correspondence
const RECENT_MEETINGS_LIMIT = 15;   // past + upcoming meetings
const RECENT_EVENTS_DAYS = 180;

/** Reasons with source IDs we didn't provide are dropped. If fewer
 *  than this many survive, we reject the whole brief. */
const MIN_GROUNDED_REASONS = 2;

/** Max excerpt length per source row in the prompt, to keep tokens sane. */
const EXCERPT_CAP = 400;

// ── Public API ────────────────────────────────────────────────

/**
 * Generate (or skip and reuse a cached) brief for one contact.
 *
 * Returns:
 *   - The brief on success
 *   - `null` if the contact has no data to brief on, or if the LLM
 *     output failed grounding validation
 *
 * Always writes-through to dante_briefs on success so the next read
 * is a DB hit.
 */
export async function generateBriefForContact(args: {
  workspace_id: string;
  contact_id: string;
  anthropicKey?: string;
  openaiKey?: string;
}): Promise<Brief | null> {
  const { workspace_id, contact_id, anthropicKey, openaiKey } = args;

  // ── Pull contact + signal rows ─────────────────────────────
  const [
    { data: contact },
    notesRes,
    apptsRes,
    callsRes,
    emailsRes,
    meetingsRes,
    events,
  ] = await Promise.all([
    supabaseAdmin
      .from("contacts")
      .select("id, name, email, phone, created_at")
      .eq("id", contact_id)
      .eq("workspace_id", workspace_id)
      .maybeSingle(),
    supabaseAdmin
      .from("notes")
      .select("id, body, created_at")
      .eq("contact_id", contact_id)
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false })
      .limit(RECENT_NOTES_LIMIT),
    supabaseAdmin
      .from("appointments")
      .select("id, scheduled_at, status, created_at")
      .eq("contact_id", contact_id)
      .eq("workspace_id", workspace_id)
      .order("scheduled_at", { ascending: false })
      .limit(RECENT_APPTS_LIMIT),
    supabaseAdmin
      .from("call_recordings")
      .select("id, created_at, summary, duration_seconds, sentiment_score, sentiment_label")
      .eq("contact_id", contact_id)
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false })
      .limit(RECENT_CALLS_LIMIT),
    // Recent client correspondence. Soft-fail if the migration
    // hasn't run yet — older workspaces will get an empty array
    // and the brief still works on the legacy signal set.
    supabaseAdmin
      .from("customer_emails")
      .select("id, direction, subject, snippet, received_at")
      .eq("contact_id", contact_id)
      .eq("workspace_id", workspace_id)
      .order("received_at", { ascending: false })
      .limit(RECENT_EMAILS_LIMIT),
    // Past + upcoming meetings — both are signal. A long gap
    // before the next scheduled meeting is a stronger predictor
    // than no recent calls.
    supabaseAdmin
      .from("calendar_events")
      .select("id, summary, start_at, end_at, status")
      .eq("contact_id", contact_id)
      .eq("workspace_id", workspace_id)
      .gte("start_at", new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
      .order("start_at", { ascending: false })
      .limit(RECENT_MEETINGS_LIMIT),
    fetchRecentEvents(workspace_id, {
      lookbackDays: RECENT_EVENTS_DAYS,
      contactIds: [contact_id],
    }),
  ]);

  if (!contact) return null;

  const notes = notesRes.data ?? [];
  const appts = apptsRes.data ?? [];
  const calls = callsRes.data ?? [];
  // emailsRes / meetingsRes can return 42P01 (table missing) on
  // workspaces where the Phase 2 SQL hasn't been applied yet.
  // Treat any error as "no data" rather than failing the brief.
  const emails = (emailsRes.error ? [] : emailsRes.data) ?? [];
  const meetings = (meetingsRes.error ? [] : meetingsRes.data) ?? [];

  // Build the grounded source set and the prompt context in one pass.
  const sources = new Set<string>();
  const context = buildContext({
    contact,
    notes,
    appts,
    calls,
    emails,
    meetings,
    events,
    sources,
  });

  // If a contact has literally nothing logged, a brief is dishonest —
  // the LLM would invent. Return a minimal "no data" healthy brief
  // rather than running the model.
  if (sources.size === 0) {
    const brief: Brief = {
      workspace_id,
      contact_id,
      risk_level: "healthy",
      headline: "No activity logged yet",
      reasons: [],
      recommended_action: "Log your first touch to start building a signal.",
      talking_points: [],
      confidence: 0.2,
      model: "none",
      input_tokens: 0,
      output_tokens: 0,
      generated_at: new Date().toISOString(),
    };
    await upsertBrief(brief);
    return brief;
  }

  // ── LLM call ────────────────────────────────────────────────
  const raw = await callModel({ context, anthropicKey, openaiKey });
  if (!raw) return null;

  const parsed = parseBriefJson(raw.text);
  if (!parsed) return null;

  // ── Anti-hallucination gate ─────────────────────────────────
  type GroundedReason = {
    text: string;
    source_table: string;
    source_id: string;
    source_excerpt?: string;
  };
  const groundedReasons: GroundedReason[] = (parsed.reasons || []).flatMap(
    (r) => {
      if (
        !r ||
        typeof r.text !== "string" ||
        typeof r.source_table !== "string" ||
        typeof r.source_id !== "string"
      ) {
        return [];
      }
      if (!sources.has(`${r.source_table}:${r.source_id}`)) return [];
      return [
        {
          text: r.text,
          source_table: r.source_table,
          source_id: r.source_id,
          source_excerpt:
            typeof r.source_excerpt === "string" ? r.source_excerpt : undefined,
        },
      ];
    }
  );

  // If the model hallucinated most of its citations, don't save.
  if (
    groundedReasons.length < MIN_GROUNDED_REASONS &&
    (parsed.reasons?.length ?? 0) > 0
  ) {
    console.warn(
      `[briefs] rejected ungrounded brief for ${contact_id}: ` +
        `${groundedReasons.length}/${parsed.reasons?.length ?? 0} reasons grounded`
    );
    return null;
  }

  const brief: Brief = {
    workspace_id,
    contact_id,
    risk_level: normalizeRisk(parsed.risk_level),
    headline: (parsed.headline || "").trim().slice(0, 280) || "No headline",
    reasons: groundedReasons.slice(0, 5).map((r) => ({
      text: r.text.trim().slice(0, 400),
      source_table: r.source_table as SourceTable,
      source_id: r.source_id,
      source_excerpt:
        typeof r.source_excerpt === "string"
          ? r.source_excerpt.slice(0, EXCERPT_CAP)
          : undefined,
    })),
    recommended_action:
      typeof parsed.recommended_action === "string"
        ? parsed.recommended_action.trim().slice(0, 500)
        : null,
    talking_points: Array.isArray(parsed.talking_points)
      ? parsed.talking_points
          .filter((t: unknown): t is string => typeof t === "string")
          .map((t: string) => t.trim().slice(0, 240))
          .slice(0, 5)
      : [],
    confidence: clamp01(Number(parsed.confidence ?? 0.5)),
    model: raw.model,
    input_tokens: raw.inputTokens,
    output_tokens: raw.outputTokens,
    generated_at: new Date().toISOString(),
  };

  await upsertBrief(brief);
  return brief;
}

// ── Context builder ──────────────────────────────────────────
// Packs the contact's data into a prompt-ready string. Every row
// gets a stable ID prefix (`note:UUID`) that the LLM must cite.
// We also register each ID in the `sources` set so the validator
// has the ground-truth citation list.

interface BuildContextArgs {
  contact: { id: string; name: string | null; email: string | null; phone: string | null; created_at: string };
  notes: Array<{ id: string; body: string | null; created_at: string }>;
  appts: Array<{ id: string; scheduled_at: string | null; status: string | null; created_at: string }>;
  calls: Array<{ id: string; created_at: string; summary: string | null; duration_seconds: number | null; sentiment_score: number | null; sentiment_label: string | null }>;
  emails: Array<{ id: string; direction: string; subject: string | null; snippet: string | null; received_at: string }>;
  meetings: Array<{ id: string; summary: string | null; start_at: string; end_at: string; status: string | null }>;
  events: Array<{ contact_id: string; event_type: string; signal: number; weight: number; created_at: string }>;
  sources: Set<string>;
}

function buildContext(args: BuildContextArgs): string {
  const { contact, notes, appts, calls, emails, meetings, events, sources } = args;
  const lines: string[] = [];

  lines.push(`CONTACT`);
  lines.push(`  name: ${contact.name ?? "(unknown)"}`);
  lines.push(`  email: ${contact.email ?? "(none)"}`);
  lines.push(`  phone: ${contact.phone ?? "(none)"}`);
  lines.push(`  first_added: ${contact.created_at}`);
  lines.push(`  today: ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");

  if (notes.length > 0) {
    lines.push(`NOTES (most recent first)`);
    for (const n of notes) {
      sources.add(`note:${n.id}`);
      const excerpt = (n.body ?? "").trim().replace(/\s+/g, " ").slice(0, EXCERPT_CAP);
      lines.push(`  note:${n.id} — ${n.created_at.slice(0, 10)} — ${excerpt || "(empty)"}`);
    }
    lines.push("");
  }

  if (appts.length > 0) {
    lines.push(`APPOINTMENTS (most recent first)`);
    for (const a of appts) {
      sources.add(`appointment:${a.id}`);
      const when = (a.scheduled_at || a.created_at).slice(0, 10);
      lines.push(`  appointment:${a.id} — ${when} — status: ${a.status ?? "(none)"}`);
    }
    lines.push("");
  }

  if (calls.length > 0) {
    lines.push(`CALLS (most recent first)`);
    for (const c of calls) {
      sources.add(`call:${c.id}`);
      const when = c.created_at.slice(0, 10);
      const dur = c.duration_seconds ? `${Math.round(c.duration_seconds / 60)}min` : "unknown dur";
      const sent = c.sentiment_label
        ? ` — sentiment: ${c.sentiment_label}${typeof c.sentiment_score === "number" ? ` (${c.sentiment_score.toFixed(2)})` : ""}`
        : "";
      const summary = (c.summary ?? "").trim().replace(/\s+/g, " ").slice(0, EXCERPT_CAP);
      lines.push(`  call:${c.id} — ${when} — ${dur}${sent}`);
      if (summary) lines.push(`    summary: ${summary}`);
    }
    lines.push("");
  }

  if (emails.length > 0) {
    lines.push(`EMAILS (most recent first; direction relative to advisor)`);
    for (const e of emails) {
      sources.add(`email:${e.id}`);
      const when = e.received_at.slice(0, 10);
      const subj = (e.subject || "(no subject)").trim().replace(/\s+/g, " ").slice(0, 120);
      const snip = (e.snippet || "").trim().replace(/\s+/g, " ").slice(0, EXCERPT_CAP);
      lines.push(`  email:${e.id} — ${when} — ${e.direction} — ${subj}`);
      if (snip) lines.push(`    snippet: ${snip}`);
    }
    lines.push("");
  }

  if (meetings.length > 0) {
    const now = Date.now();
    lines.push(`MEETINGS (calendar events linked to this contact)`);
    for (const m of meetings) {
      sources.add(`meeting:${m.id}`);
      const startMs = new Date(m.start_at).getTime();
      const when = m.start_at.slice(0, 10);
      const tag = startMs < now ? "past" : "upcoming";
      const subj = (m.summary || "(no title)").trim().replace(/\s+/g, " ").slice(0, 120);
      const status = m.status ? ` — status: ${m.status}` : "";
      lines.push(`  meeting:${m.id} — ${when} — ${tag} — ${subj}${status}`);
    }
    lines.push("");
  }

  if (events.length > 0) {
    lines.push(`CHURN EVENTS (last ${RECENT_EVENTS_DAYS} days, signed signal × weight)`);
    for (const e of events) {
      // churn_events have no id exposed here — synthesize a stable one
      // from contact + type + timestamp so the LLM can still cite them.
      // Not ideal; we accept event citations but only as supplementary.
      const synth = `${e.event_type}-${new Date(e.created_at).getTime()}`;
      sources.add(`churn_event:${synth}`);
      lines.push(
        `  churn_event:${synth} — ${e.created_at.slice(0, 10)} — ${e.event_type} — signal=${e.signal.toFixed(2)} weight=${e.weight.toFixed(2)}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Prompt ────────────────────────────────────────────────────

function buildPrompt(context: string): string {
  return `You are a financial advisor's assistant. You read a single client's recent activity log and write a short, actionable brief for your advisor.

RULES (strict):
1. Every "reason" in your output MUST cite exactly one source row by ID. The valid IDs are the tokens like "note:<uuid>", "appointment:<uuid>", "call:<uuid>", "email:<uuid>", "meeting:<uuid>", or "churn_event:<synth>" that appear verbatim in the ACTIVITY LOG below. DO NOT invent IDs.
2. Prefer 3 reasons. Never exceed 5. Each reason must be one clear sentence.
3. Risk level must be one of: "healthy", "watch", "act_now", "critical".
   - "healthy": recent engagement, positive signals, nothing to act on
   - "watch": slight drift or mild negative signal; no action required this week
   - "act_now": clear disengagement or recent negative signal; reach out this week
   - "critical": severe negative signal or long silence; reach out today
4. "recommended_action" is ONE concrete thing the advisor should do next (e.g. "Call to schedule a 15-min check-in"). Keep it under 20 words.
5. "talking_points" is 2–4 short bullets (one sentence each) the advisor can use if they call.
6. "confidence" is a self-assessed 0.0–1.0 number reflecting how much evidence supports your risk_level.
7. If the ACTIVITY LOG is sparse, return a brief with risk_level "healthy" or "watch", an honest headline ("Limited history — light touch recommended"), and fewer reasons. Never fabricate to fill the schema.

Output ONLY a single JSON object. No prose before or after.

SCHEMA:
{
  "risk_level": "healthy" | "watch" | "act_now" | "critical",
  "headline": string,                             // one-line summary, ≤120 chars
  "reasons": [
    {
      "text": string,                              // one sentence
      "source_table": "note" | "appointment" | "call" | "email" | "meeting" | "churn_event",
      "source_id": string,                         // id from the ACTIVITY LOG, verbatim
      "source_excerpt": string                     // optional, ≤200 chars quote
    }
  ],
  "recommended_action": string,
  "talking_points": string[],
  "confidence": number
}

ACTIVITY LOG:
${context}`;
}

// ── Model call (Anthropic → OpenAI fallback) ─────────────────

interface ModelResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

async function callModel(args: {
  context: string;
  anthropicKey?: string;
  openaiKey?: string;
}): Promise<ModelResult | null> {
  const prompt = buildPrompt(args.context);

  if (args.anthropicKey) {
    try {
      const model = "claude-haiku-4-5-20251001";
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": args.anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const text = (d.content || [])
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { text: string }) => b.text || "")
          .join("")
          .trim();
        if (text) {
          return {
            text,
            model,
            inputTokens: d.usage?.input_tokens ?? 0,
            outputTokens: d.usage?.output_tokens ?? 0,
          };
        }
      } else {
        const errText = await r.text().catch(() => "");
        console.warn("[briefs] anthropic non-ok:", r.status, errText.slice(0, 200));
      }
    } catch (e) {
      console.warn("[briefs] anthropic threw:", e instanceof Error ? e.message : e);
    }
  }

  if (args.openaiKey) {
    try {
      const model = "gpt-5";
      const result = await llmComplete({
        model,
        temperature: 0.2,
        maxTokens: 1200,
        responseFormat: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
        feature: "briefs.generate",
      });
      const text = (result.message.content || "").trim();
      if (text) {
        return {
          text,
          model,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
        };
      }
    } catch (e) {
      console.warn("[briefs] llm threw:", e instanceof Error ? e.message : e);
    }
  }

  return null;
}

// ── Parse + normalize ────────────────────────────────────────

interface ParsedBrief {
  risk_level?: string;
  headline?: string;
  reasons?: Array<{
    text?: string;
    source_table?: string;
    source_id?: string;
    source_excerpt?: string;
  }>;
  recommended_action?: string;
  talking_points?: unknown;
  confidence?: number;
}

function parseBriefJson(raw: string): ParsedBrief | null {
  // Strip ```json fences if the model slipped them in.
  let cleaned = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  // Some models wrap in prose — try to grab the first {...} block.
  if (!cleaned.startsWith("{")) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) cleaned = m[0];
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function normalizeRisk(raw: string | undefined): RiskLevel {
  const v = (raw || "").toLowerCase().trim();
  if (v === "critical" || v === "act_now" || v === "watch" || v === "healthy") {
    return v;
  }
  // Tolerant fallbacks for common near-misses.
  if (v.includes("critical")) return "critical";
  if (v.includes("act")) return "act_now";
  if (v.includes("watch") || v.includes("risk")) return "watch";
  return "healthy";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

// ── Persistence ──────────────────────────────────────────────

async function upsertBrief(brief: Brief): Promise<void> {
  const { error } = await supabaseAdmin
    .from("dante_briefs")
    .upsert(
      {
        workspace_id: brief.workspace_id,
        contact_id: brief.contact_id,
        risk_level: brief.risk_level,
        headline: brief.headline,
        reasons: brief.reasons,
        recommended_action: brief.recommended_action,
        talking_points: brief.talking_points,
        confidence: brief.confidence,
        model: brief.model,
        input_tokens: brief.input_tokens,
        output_tokens: brief.output_tokens,
        generated_at: brief.generated_at,
      },
      { onConflict: "workspace_id,contact_id" }
    );
  if (error) {
    console.warn("[briefs] upsert failed:", error.message);
  }
}

/**
 * Fetch the cached brief for a contact, or null if missing/stale.
 * `maxAgeHours` defaults to 24 — past that we treat as stale and
 * the caller should regenerate.
 */
export async function getCachedBrief(args: {
  workspace_id: string;
  contact_id: string;
  maxAgeHours?: number;
}): Promise<Brief | null> {
  const maxAge = (args.maxAgeHours ?? 24) * 3600_000;
  const { data } = await supabaseAdmin
    .from("dante_briefs")
    .select("*")
    .eq("workspace_id", args.workspace_id)
    .eq("contact_id", args.contact_id)
    .maybeSingle();
  if (!data) return null;
  const age = Date.now() - new Date(data.generated_at).getTime();
  if (age > maxAge) return null;
  return {
    workspace_id: data.workspace_id,
    contact_id: data.contact_id,
    risk_level: data.risk_level,
    headline: data.headline,
    reasons: data.reasons || [],
    recommended_action: data.recommended_action,
    talking_points: data.talking_points || [],
    confidence: Number(data.confidence ?? 0),
    model: data.model,
    input_tokens: data.input_tokens ?? 0,
    output_tokens: data.output_tokens ?? 0,
    generated_at: data.generated_at,
  };
}
