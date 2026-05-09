// lib/dante/noticed/agent.ts
//
// Autonomous noticer agent — runs once per workspace per day, after
// the deterministic computers in compute.ts have done their cheap
// SQL pass. The agent reads recent activity (notes, calendar, vault
// uploads, regulatory ingest, and the day's notices already on the
// dashboard) and surfaces things a fiduciary/realtor would want to
// know but might miss — patterns the deterministic computers can't
// pick up.
//
// Pattern: one structured-JSON LLM call, like lib/dante/regulatory
// /brief.ts. We deliberately do NOT use a tool-using loop here —
// brief.ts has shipped reliably for months on this shape, costs are
// fixed per call, and the model can't go off-rails because every
// id we accept must come from the context dump we provide.
//
// Cost discipline:
//   • Per-workspace daily $ cap (workspaces.noticer_daily_cap_cents).
//     Cron checks ledger sum tagged feature='noticer_agent' and
//     skips the workspace when over.
//   • Per-workspace toggle (workspaces.noticer_agent_enabled).
//   • Hard ceiling on emitted notices (MAX_EMISSIONS_PER_RUN) to
//     prevent the model from filling the dashboard with noise.

import { complete as llmComplete } from "@/lib/llm/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Industry } from "@/lib/industry/config";
import type { NoticedRow } from "./compute";

const NOTICER_MODEL = "claude-sonnet-4-6";
const MAX_EMISSIONS_PER_RUN = 4;
const RECENT_CONTACTS_LIMIT = 30;
const UPCOMING_EVENTS_LIMIT = 8;
const RECENT_VAULT_LIMIT = 8;
const RECENT_REG_LIMIT = 5;
const EXISTING_NOTICES_LIMIT = 12;

interface AgentRunResult {
  rows: NoticedRow[];
  /** Why this run produced what it produced — for cron logging. */
  reason: string;
  /** True when the run was skipped (toggle off, cap hit, no context). */
  skipped: boolean;
}

interface NoticerContact {
  id: string;
  name: string;
  last_touch_iso: string | null;
}

interface NoticerEvent {
  id: string;
  contact_id: string | null;
  contact_name: string | null;
  summary: string | null;
  start_at: string;
}

interface NoticerVaultItem {
  id: string;
  title: string;
  project_id: string | null;
  created_at: string;
}

interface NoticerRegItem {
  id: string;
  authority: string;
  title: string;
  source_url: string;
  published_at: string | null;
}

interface NoticerExistingNotice {
  kind: string;
  target_kind: string | null;
  target_id: string | null;
  title: string;
}

interface NoticerContext {
  workspaceId: string;
  vertical: Industry;
  firmName: string;
  contacts: NoticerContact[];
  upcomingEvents: NoticerEvent[];
  recentVault: NoticerVaultItem[];
  recentRegulatory: NoticerRegItem[];
  existingNotices: NoticerExistingNotice[];
}

interface RawEmission {
  kind?: unknown;
  severity?: unknown;
  title?: unknown;
  body?: unknown;
  target_kind?: unknown;
  target_id?: unknown;
  citation_source_kind?: unknown;
  citation_source_id?: unknown;
  citation_source_url?: unknown;
  citation_source_title?: unknown;
  citation_quote?: unknown;
  expires_in_days?: unknown;
}

const ALLOWED_TARGET_KINDS = new Set([
  "contact",
  "vault_item",
  "regulation",
  "calendar_event",
]);

const ALLOWED_KINDS = new Set([
  "client_attention_needed",
  "client_signal",
  "vault_followup",
  "regulatory_pattern",
  "calendar_prep_deep",
  "cross_client_pattern",
]);

const SEVERITIES = new Set(["info", "attention", "urgent"]);

/** Sum of today's noticer spend for a workspace, in cents. */
async function todaysNoticerSpendCents(workspaceId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data } = await supabaseAdmin
    .from("dante_usage_ledger")
    .select("cost_cents")
    .eq("workspace_id", workspaceId)
    .eq("feature", "noticer_agent")
    .gte("created_at", startOfDay.toISOString());
  return ((data || []) as Array<{ cost_cents: number }>).reduce(
    (sum, r) => sum + (r.cost_cents || 0),
    0,
  );
}

/** Pull the per-workspace context the model needs to triage. */
async function loadNoticerContext(
  workspaceId: string,
  vertical: Industry,
  now: Date,
): Promise<NoticerContext> {
  const fourteenDaysAgo = new Date(
    now.getTime() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const sevenDaysAhead = new Date(
    now.getTime() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const sevenDaysAgo = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const oneDayAgo = new Date(
    now.getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();

  // Recently-touched contacts. We pull the most recent note per
  // contact in the past 14 days, then map back to contacts to give
  // the model "who's been active". Anti-staleness signal — the
  // deterministic computer already handles "client_stale" 90+ days,
  // so the agent's job is the OTHER end: read the active set.
  const [{ data: recentNotes }, { data: events }, { data: vaultItems },
         { data: regItems }, { data: existingNotices }] = await Promise.all([
    supabaseAdmin
      .from("notes")
      .select("contact_id, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", fourteenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("calendar_events")
      .select("id, contact_id, summary, start_at")
      .eq("workspace_id", workspaceId)
      .gte("start_at", now.toISOString())
      .lte("start_at", sevenDaysAhead)
      .neq("status", "cancelled")
      .order("start_at", { ascending: true })
      .limit(UPCOMING_EVENTS_LIMIT),
    supabaseAdmin
      .from("vault_items")
      .select("id, title, project_id, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(RECENT_VAULT_LIMIT),
    supabaseAdmin
      .from("regulatory_corpus_items")
      .select("id, authority, title, source_url, published_at")
      .contains("industry_scope", [vertical])
      .gte("published_at", sevenDaysAgo)
      .order("published_at", { ascending: false })
      .limit(RECENT_REG_LIMIT),
    supabaseAdmin
      .from("dante_noticed")
      .select("kind, target_kind, target_id, title")
      .eq("workspace_id", workspaceId)
      .is("handled_at", null)
      .gte("created_at", oneDayAgo)
      .order("created_at", { ascending: false })
      .limit(EXISTING_NOTICES_LIMIT),
  ]);

  // Collapse notes → most recent per contact_id.
  const lastTouchByContact = new Map<string, string>();
  for (const n of (recentNotes || []) as Array<{
    contact_id: string | null;
    created_at: string;
  }>) {
    if (!n.contact_id) continue;
    if (!lastTouchByContact.has(n.contact_id)) {
      lastTouchByContact.set(n.contact_id, n.created_at);
    }
  }

  const activeContactIds = Array.from(lastTouchByContact.keys()).slice(
    0,
    RECENT_CONTACTS_LIMIT,
  );

  // Pull contact names + workspace name in parallel.
  const [contactsRes, wsRes] = await Promise.all([
    activeContactIds.length > 0
      ? supabaseAdmin
          .from("contacts")
          .select("id, name, full_name")
          .in("id", activeContactIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; full_name: string | null }> }),
    supabaseAdmin
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle(),
  ]);

  const contactNameById = new Map<string, string>();
  for (const c of (contactsRes.data || []) as Array<{
    id: string;
    name: string | null;
    full_name: string | null;
  }>) {
    contactNameById.set(c.id, c.name || c.full_name || "(unnamed)");
  }

  const contacts: NoticerContact[] = activeContactIds.map((id) => ({
    id,
    name: contactNameById.get(id) || "(unnamed)",
    last_touch_iso: lastTouchByContact.get(id) || null,
  }));

  const upcomingEvents: NoticerEvent[] = (
    (events || []) as Array<{
      id: string;
      contact_id: string | null;
      summary: string | null;
      start_at: string;
    }>
  ).map((e) => ({
    id: e.id,
    contact_id: e.contact_id,
    contact_name: e.contact_id ? contactNameById.get(e.contact_id) || null : null,
    summary: e.summary,
    start_at: e.start_at,
  }));

  return {
    workspaceId,
    vertical,
    firmName: ((wsRes as { data: { name: string | null } | null }).data?.name) || "this firm",
    contacts,
    upcomingEvents,
    recentVault: ((vaultItems || []) as NoticerVaultItem[]),
    recentRegulatory: ((regItems || []) as NoticerRegItem[]),
    existingNotices: ((existingNotices || []) as NoticerExistingNotice[]),
  };
}

function buildPrompt(ctx: NoticerContext): string {
  const role =
    ctx.vertical === "real_estate"
      ? "real estate brokerage"
      : "registered investment advisor (RIA)";
  const audienceLabel =
    ctx.vertical === "real_estate" ? "buyers / sellers" : "client households";

  const contactsBlock = ctx.contacts.length
    ? ctx.contacts
        .map(
          (c) =>
            `  - id=${c.id} name="${c.name}" last_touch=${c.last_touch_iso ?? "n/a"}`,
        )
        .join("\n")
    : "  (no recently-touched contacts)";

  const eventsBlock = ctx.upcomingEvents.length
    ? ctx.upcomingEvents
        .map(
          (e) =>
            `  - id=${e.id} when=${e.start_at}${
              e.contact_name ? ` with "${e.contact_name}"` : ""
            }${e.summary ? ` (${e.summary})` : ""}`,
        )
        .join("\n")
    : "  (no upcoming events in the next 7 days)";

  const vaultBlock = ctx.recentVault.length
    ? ctx.recentVault
        .map((v) => `  - id=${v.id} title="${v.title}" added=${v.created_at}`)
        .join("\n")
    : "  (no new vault uploads in the past 7 days)";

  const regBlock = ctx.recentRegulatory.length
    ? ctx.recentRegulatory
        .map(
          (r) =>
            `  - id=${r.id} authority=${r.authority} title="${r.title}" published=${r.published_at ?? "n.d."}`,
        )
        .join("\n")
    : "  (no new in-scope regulatory items in the past 7 days)";

  const existingBlock = ctx.existingNotices.length
    ? ctx.existingNotices
        .map(
          (n) =>
            `  - kind=${n.kind} target=${n.target_kind ?? "n/a"}:${n.target_id ?? "n/a"} title="${n.title}"`,
        )
        .join("\n")
    : "  (none)";

  return `You are the autonomous proactive layer for a ${role}. Every night you scan recent activity for things the firm's owner would want to know but might miss. Today, you have the following context:

[recently-touched contacts (last 14d)]
${contactsBlock}

[upcoming calendar events (next 7d)]
${eventsBlock}

[new vault uploads (last 7d)]
${vaultBlock}

[new in-scope regulatory items (last 7d)]
${regBlock}

[notices ALREADY on the dashboard from earlier today — do NOT duplicate these]
${existingBlock}

Your job: emit between 0 and ${MAX_EMISSIONS_PER_RUN} notices that are genuinely worth a ${audienceLabel}-focused fiduciary's attention right now and are not already covered by the existing notices above. Examples of good notice kinds:

  - "client_attention_needed": A specific recently-touched contact has a pattern in their notes that suggests proactive outreach (life event, decision deadline, mentioned plan to move money/list property, etc.). target_kind=contact, target_id=<contact id from list above>.
  - "client_signal": A pattern across recent activity suggests a ${audienceLabel}'s relationship is changing (engagement up or down, sentiment shift). target_kind=contact.
  - "vault_followup": A recently uploaded document raises a question that should be discussed with a contact (missing signature, unusual term, mismatch with prior version). target_kind=vault_item, target_id=<vault item id>.
  - "regulatory_pattern": A recent regulatory item, taken together with the firm's recent activity, suggests a specific concrete next step. target_kind=regulation, target_id=<regulatory item id>.
  - "calendar_prep_deep": An upcoming meeting deserves more prep than the generic "Meeting with X tomorrow" — there's a substantive question to ask or document to bring. target_kind=calendar_event, target_id=<event id>.
  - "cross_client_pattern": Two or more clients have a similar concern worth a group note or batched outreach. target_kind=null (no single target).

Output STRICT JSON, no prose outside it:
{
  "emissions": [
    {
      "kind": "<one of the kinds listed above>",
      "severity": "info" | "attention" | "urgent",
      "title": "<one short line, ≤ 80 chars>",
      "body": "<one short paragraph, ≤ 280 chars, plain English, names the specific reason>",
      "target_kind": "contact" | "vault_item" | "regulation" | "calendar_event" | null,
      "target_id": "<id from the context above, or null>",
      "citation_source_kind": "regulation" | "vault_item" | "note" | null,
      "citation_source_id": "<id of the source you're citing, or null>",
      "citation_source_url": "<URL if regulatory, else null>",
      "citation_source_title": "<short label for the citation, or null>",
      "citation_quote": "<short quote or one-line paraphrase from the source, or null>",
      "expires_in_days": <integer 1-30, default 7>
    }
  ]
}

Hard rules:
  - Every target_id MUST come verbatim from the context above. Never invent ids.
  - If you have nothing genuinely worth flagging, emit { "emissions": [] }. Empty is the right answer most days.
  - Never restate something already in the existing-notices list.
  - Be specific. "Check in with Mrs. Chen" is bad; "Mrs. Chen's last note mentioned planning to roll over her 401(k) before her July retirement" is good.
  - severity: "urgent" only when there is a deadline or a fiduciary risk; "attention" for things worth doing this week; "info" otherwise.`;
}

interface NormalizedEmission {
  kind: string;
  severity: "info" | "attention" | "urgent";
  title: string;
  body: string;
  target_kind: string | null;
  target_id: string | null;
  citation_source_kind: string | null;
  citation_source_id: string | null;
  citation_source_url: string | null;
  citation_source_title: string | null;
  citation_quote: string | null;
  expires_in_days: number;
}

function normalizeEmissions(
  raw: unknown,
  ctx: NoticerContext,
): NormalizedEmission[] {
  if (!Array.isArray(raw)) return [];
  const validIds = new Set<string>([
    ...ctx.contacts.map((c) => c.id),
    ...ctx.upcomingEvents.map((e) => e.id),
    ...ctx.recentVault.map((v) => v.id),
    ...ctx.recentRegulatory.map((r) => r.id),
  ]);

  const out: NormalizedEmission[] = [];
  for (const item of raw as RawEmission[]) {
    const kind = String(item.kind || "").trim();
    if (!ALLOWED_KINDS.has(kind)) continue;

    const severity = String(item.severity || "").trim();
    if (!SEVERITIES.has(severity)) continue;

    const title = String(item.title || "").trim();
    const body = String(item.body || "").trim();
    if (!title || !body) continue;

    const targetKind = item.target_kind ? String(item.target_kind).trim() : null;
    const targetId = item.target_id ? String(item.target_id).trim() : null;

    if (targetKind && !ALLOWED_TARGET_KINDS.has(targetKind)) continue;
    if (targetId && !validIds.has(targetId)) continue;
    if (targetKind && !targetId) continue;
    if (targetId && !targetKind) continue;

    let expiresInDays = Number(item.expires_in_days) || 7;
    if (!Number.isFinite(expiresInDays)) expiresInDays = 7;
    expiresInDays = Math.max(1, Math.min(30, Math.floor(expiresInDays)));

    out.push({
      kind,
      severity: severity as "info" | "attention" | "urgent",
      title: title.slice(0, 200),
      body: body.slice(0, 600),
      target_kind: targetKind,
      target_id: targetId,
      citation_source_kind:
        item.citation_source_kind != null && String(item.citation_source_kind).trim()
          ? String(item.citation_source_kind).trim()
          : null,
      citation_source_id:
        item.citation_source_id != null && String(item.citation_source_id).trim()
          ? String(item.citation_source_id).trim()
          : null,
      citation_source_url:
        item.citation_source_url != null && String(item.citation_source_url).trim()
          ? String(item.citation_source_url).trim()
          : null,
      citation_source_title:
        item.citation_source_title != null && String(item.citation_source_title).trim()
          ? String(item.citation_source_title).trim()
          : null,
      citation_quote:
        item.citation_quote != null && String(item.citation_quote).trim()
          ? String(item.citation_quote).trim()
          : null,
      expires_in_days: expiresInDays,
    });

    if (out.length >= MAX_EMISSIONS_PER_RUN) break;
  }
  return out;
}

function emissionToNoticedRow(
  e: NormalizedEmission,
  ctx: NoticerContext,
  now: Date,
): NoticedRow {
  const dateBucket = now.toISOString().slice(0, 10);
  const targetSegment = e.target_id ? `:${e.target_id}` : ":none";
  const citations =
    e.citation_source_kind && e.citation_source_id
      ? [
          {
            source_kind: e.citation_source_kind,
            source_id: e.citation_source_id,
            source_url: e.citation_source_url,
            source_title: e.citation_source_title,
            quote: e.citation_quote,
          },
        ]
      : [];

  return {
    workspace_id: ctx.workspaceId,
    vertical: ctx.vertical,
    kind: e.kind,
    severity: e.severity,
    title: e.title,
    body: e.body,
    target_kind: e.target_kind,
    target_id: e.target_id,
    citations,
    dedupe_key: `${e.kind}${targetSegment}:${dateBucket}`,
    expires_at: new Date(
      now.getTime() + e.expires_in_days * 86400_000,
    ).toISOString(),
  };
}

/**
 * Run the noticer agent for one workspace. Returns the rows the
 * caller should upsert via upsertNoticed(). Skip-cases (toggle off,
 * cap exceeded, empty context) return rows=[] with skipped=true and
 * a reason string for the cron summary.
 */
export async function runNoticerAgent(
  workspaceId: string,
  vertical: Industry,
  now: Date,
): Promise<AgentRunResult> {
  // Toggle + cap check. The columns are added by
  // 20260510_noticer_agent.sql; if the migration hasn't landed yet
  // the columns are undefined and we treat the workspace as enabled
  // with the default cap, so dev/preview environments work.
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("noticer_agent_enabled, noticer_daily_cap_cents")
    .eq("id", workspaceId)
    .maybeSingle();
  const enabled = (ws as { noticer_agent_enabled?: boolean } | null)
    ?.noticer_agent_enabled;
  if (enabled === false) {
    return { rows: [], reason: "toggle_off", skipped: true };
  }
  const capCents =
    (ws as { noticer_daily_cap_cents?: number } | null)?.noticer_daily_cap_cents ??
    15;

  const spentCents = await todaysNoticerSpendCents(workspaceId);
  if (spentCents >= capCents) {
    return {
      rows: [],
      reason: `daily_cap_hit (${spentCents}/${capCents}¢)`,
      skipped: true,
    };
  }

  const ctx = await loadNoticerContext(workspaceId, vertical, now);

  // If there's literally nothing to look at (empty workspace), skip
  // the LLM call entirely.
  const hasAnyContext =
    ctx.contacts.length > 0 ||
    ctx.upcomingEvents.length > 0 ||
    ctx.recentVault.length > 0 ||
    ctx.recentRegulatory.length > 0;
  if (!hasAnyContext) {
    return { rows: [], reason: "no_context", skipped: true };
  }

  const prompt = buildPrompt(ctx);

  let result;
  try {
    result = await llmComplete({
      model: NOTICER_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You produce structured JSON proactive notices for fiduciaries. Be terse. Be honest about there being nothing actionable — empty emissions is the right answer most days. Never invent ids or facts not present in the prompt. Cite sources you reference.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      responseFormat: { type: "json_object" },
      maxTokens: 1500,
      feature: "noticer_agent",
      workspaceId,
    });
  } catch (err) {
    return {
      rows: [],
      reason: `llm_error: ${err instanceof Error ? err.message : String(err)}`,
      skipped: true,
    };
  }

  let parsed: { emissions?: unknown };
  try {
    parsed = JSON.parse(result.message.content || "{}");
  } catch {
    return { rows: [], reason: "invalid_json", skipped: true };
  }

  const normalized = normalizeEmissions(parsed.emissions, ctx);
  const rows = normalized.map((e) => emissionToNoticedRow(e, ctx, now));

  return {
    rows,
    reason: `emitted ${rows.length}/${normalized.length} (raw)`,
    skipped: false,
  };
}
