// lib/dante/regulatory/brief.ts
//
// Generate a structured regulatory briefing for one workspace given
// a batch of new regulatory items. Called by the regulatory-briefs
// cron after each ingest run.
//
// Why a single LLM call instead of the full agent loop: the agent
// loop's tool-use machinery would let the model run memory.search
// + clients.query as it analyzes — but that's expensive (multiple
// LLM hops per item per workspace). For a daily background brief,
// pre-loading a workspace context summary into the prompt and
// asking for one structured JSON output is 10-20x cheaper and
// adequate for "is this relevant + which clients + what to do."
//
// The trade-off: the brief uses summary-level workspace context,
// not per-item drilldown. If the model says "affects clients with
// large IRA balances", it's making a judgment from a one-line
// snippet, not from a fresh memory search per client. We accept
// this — the user can always click "Ask Dante about this finding"
// for the deeper answer.

import { complete as llmComplete } from "@/lib/llm/client";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface RegulatoryItem {
  id: string;
  authority: string;
  source_kind: string;
  source_url: string;
  title: string;
  body: string;
  published_at: string | null;
}

export interface BriefFinding {
  item_id: string;
  authority: string;
  title: string;
  source_url: string;
  /** 'high' | 'medium' | 'low' | 'none' — none means "ignore". */
  relevance: "high" | "medium" | "low" | "none";
  /** One-sentence implication for the firm, plain English. */
  summary: string;
  /** Who's potentially affected. The model picks from the
   *  workspace context provided; an empty array is fine for items
   *  that affect "all clients of a certain type" generically. */
  affected_clients: Array<{
    contact_id?: string | null;
    name: string;
    why: string;
  }>;
  /** What the user should do this week, if anything. Null when
   *  relevance is 'low' or 'none'. */
  recommended_action: string | null;
}

export interface BriefResult {
  findings: BriefFinding[];
  items_considered: number;
  items_relevant: number;
  model: string;
}

const BRIEF_MODEL = "claude-haiku-4-5";

/**
 * Pulls a compact summary of the workspace's book to give the
 * model enough context to judge relevance + name affected clients.
 * Caps everything tightly so the prompt stays small even for
 * workspaces with thousands of contacts.
 */
async function loadWorkspaceContext(workspaceId: string): Promise<{
  industry: "real_estate";
  contact_count: number;
  contact_sample: Array<{ id: string; name: string; stage?: string | null }>;
}> {
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("industry")
    .eq("id", workspaceId)
    .maybeSingle();
  const industry = "real_estate" as const;

  const { data: contacts, count } = await supabaseAdmin
    .from("contacts")
    .select("id, name, full_name, stage", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const contact_sample = ((contacts || []) as Array<{
    id: string;
    name?: string | null;
    full_name?: string | null;
    stage?: string | null;
  }>).map((c) => ({
    id: c.id,
    name: c.name || c.full_name || "(unnamed)",
    stage: c.stage ?? null,
  }));

  return { industry, contact_count: count ?? contact_sample.length, contact_sample };
}

function buildPrompt(
  industry: "real_estate",
  contactCount: number,
  contactSample: Array<{ id: string; name: string; stage?: string | null }>,
  items: RegulatoryItem[],
): string {
  const role = "real estate brokerage";
  const audience =
    industry === "real_estate"
      ? "buyers, sellers, properties, transactions, fair-housing posture, brokerage supervision"
      : "client households, retirement accounts, tax-deferred vehicles, fiduciary duties, ADV/compliance posture";

  const contactsBlock = contactSample.length
    ? contactSample
        .map(
          (c) =>
            `  - id=${c.id} name="${c.name}"${
              c.stage ? ` stage=${c.stage}` : ""
            }`,
        )
        .join("\n")
    : "  (no contacts yet — workspace just started)";

  const itemsBlock = items
    .map(
      (it, i) => `[item ${i + 1}]
  id: ${it.id}
  authority: ${it.authority}
  kind: ${it.source_kind}
  date: ${it.published_at ?? "n.d."}
  title: ${it.title}
  body: ${it.body.slice(0, 800)}${it.body.length > 800 ? "…" : ""}
  source_url: ${it.source_url}
`,
    )
    .join("\n");

  return `You are the regulatory-monitoring brain for a ${role}. New regulatory items have just been published; your job is to triage them against the firm's actual book.

The firm has ${contactCount} active contact${contactCount === 1 ? "" : "s"}; here's a sample (most recently created first):
${contactsBlock}

The firm's relevant context: ${audience}.

For EACH item below, produce one finding. A finding has these fields:
  - item_id: copy the item's id exactly
  - authority: copy the item's authority (SEC / IRS / DOL / HUD / etc.)
  - title: copy the item's title
  - source_url: copy the item's source_url
  - relevance: one of "high" | "medium" | "low" | "none"
      high   = directly affects the firm's day-to-day fiduciary or compliance posture
      medium = relevant to specific client situations or worth flagging
      low    = peripheral; mention briefly
      none   = not relevant to this kind of firm — skip
  - summary: one plain-English sentence describing what changed and why a ${role} would care. No jargon, no boilerplate, no "this is important". Just the implication. If relevance is "none", set summary to "Not relevant to this firm." and omit the rest.
  - affected_clients: array of {contact_id, name, why}. Pick from the contact sample above ONLY when you can name a specific reason this item touches that contact's situation. If the item is generic ("affects all clients with retirement accounts"), leave this array empty rather than guessing — the user will run a targeted query themselves. contact_id MUST come verbatim from the sample; do not invent ids.
  - recommended_action: one concrete action the user should take this week. Null when relevance is "low" or "none". Examples: "Review your IPS template against the new ADV disclosure requirement", "Email clients in CA about the state-fiduciary update". Avoid vague advice like "stay informed".

Items to analyze:

${itemsBlock}

Return STRICT JSON: {"findings": [...]}. No prose outside the JSON. Order findings the same as the items above.`;
}

export async function generateRegulatoryBrief(
  workspaceId: string,
  items: RegulatoryItem[],
): Promise<BriefResult> {
  if (items.length === 0) {
    return {
      findings: [],
      items_considered: 0,
      items_relevant: 0,
      model: BRIEF_MODEL,
    };
  }

  const ctx = await loadWorkspaceContext(workspaceId);
  const prompt = buildPrompt(ctx.industry, ctx.contact_count, ctx.contact_sample, items);

  const result = await llmComplete({
    model: BRIEF_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You produce structured JSON regulatory triage for fiduciaries. Be terse. Be honest about irrelevance — most regulatory news is not actionable for a given firm. Never invent contact ids or facts not present in the prompt.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    responseFormat: { type: "json_object" },
    maxTokens: 2000,
  });

  let parsed: { findings?: unknown };
  try {
    parsed = JSON.parse(result.message.content || "{}");
  } catch (err) {
    throw new Error(
      `regulatory brief: model returned invalid JSON: ${err instanceof Error ? err.message : err}`,
    );
  }

  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings: BriefFinding[] = rawFindings.map((f) => normalizeFinding(f));

  return {
    findings,
    items_considered: items.length,
    items_relevant: findings.filter((f) => f.relevance !== "none").length,
    model: BRIEF_MODEL,
  };
}

function normalizeFinding(raw: unknown): BriefFinding {
  const r = (raw || {}) as Record<string, unknown>;
  const relevance = (r.relevance as string) || "none";
  const valid = ["high", "medium", "low", "none"];
  return {
    item_id: String(r.item_id || ""),
    authority: String(r.authority || "OTHER"),
    title: String(r.title || ""),
    source_url: String(r.source_url || ""),
    relevance: (valid.includes(relevance) ? relevance : "none") as BriefFinding["relevance"],
    summary: String(r.summary || ""),
    affected_clients: Array.isArray(r.affected_clients)
      ? (r.affected_clients as Array<Record<string, unknown>>).map((c) => ({
          contact_id: c.contact_id != null ? String(c.contact_id) : null,
          name: String(c.name || ""),
          why: String(c.why || ""),
        }))
      : [],
    recommended_action:
      r.recommended_action != null && String(r.recommended_action).trim()
        ? String(r.recommended_action)
        : null,
  };
}
