// /api/dante/cron/memory-rollup
//
// Weekly roll-up that compresses recent episode entries per contact
// into a single `summary` kind memory. Runs Mondays via vercel.json.
//
// Why: dante_memory.search ranks by similarity × confidence and falls
// back to recency × confidence when the query embedding is sparse.
// Without summaries, older episodes (a 6-month-old call recap, a
// quarterly review email) get buried under fresher noise. A weekly
// summary kind entry sits at the top of subject-scoped lookups and
// gives the agent a compact view of "what's been going on" without
// needing to retrieve 30 episodes.
//
// Process per workspace:
//   1. Find contacts who have ≥3 episode entries from the last 7
//      days (≥3 keeps the bar for "interesting enough to summarize").
//   2. For each, pull the episodes + any prior summary still active.
//   3. Ask gpt-4o-mini to produce 4-6 bullets covering: open
//      promises, recent concerns, commitments either side made,
//      emotional tone of the relationship.
//   4. remember() with kind='summary', source_kind='workflow',
//      source_id=`rollup:{week}:{contact_id}`. The unique source_id
//      makes the run idempotent within the same week.
//
// Auth: Authorization: Bearer $CRON_SECRET. Open in dev when no
// secret is configured.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { remember } from "@/lib/dante/memory/write";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLLUP_LOOKBACK_DAYS = 7;
const MIN_EPISODES = 3;
const MAX_CONTACTS_PER_WORKSPACE = 50;
const MAX_EPISODES_PER_CONTACT = 30;

function authOk(request: Request): boolean {
  // Header-only cron auth — the `?key=` fallback was removed because
  // query-param secrets get logged.
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: open
  return bearer === secret;
}

function isoWeekKey(d: Date): string {
  // ISO week-year + week number, used as the idempotency key in
  // source_id so the same week's run can't double-write.
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function rollupContact(args: {
  workspaceId: string;
  contactId: string;
  contactName: string | null;
  weekKey: string;
  openaiKey: string;
}): Promise<{ ok: true; written: boolean } | { ok: false; error: string }> {
  const { workspaceId, contactId, contactName, weekKey, openaiKey } = args;
  const sourceId = `rollup:${weekKey}:${contactId}`;

  // Idempotency — skip if we already summarized this contact this week.
  const { data: existing } = await supabaseAdmin
    .from("dante_memory")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("source_kind", "workflow")
    .eq("source_id", sourceId)
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: true, written: false };
  }

  const since = new Date(Date.now() - ROLLUP_LOOKBACK_DAYS * 86400_000).toISOString();
  const { data: episodes } = await supabaseAdmin
    .from("dante_memory")
    .select("kind, content, source_kind, created_at")
    .eq("workspace_id", workspaceId)
    .eq("subject_contact_id", contactId)
    .eq("kind", "episode")
    .is("superseded_by", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(MAX_EPISODES_PER_CONTACT);

  if (!episodes || episodes.length < MIN_EPISODES) {
    return { ok: true, written: false };
  }

  const transcript = episodes
    .map((e: any, i: number) => `[${i + 1}] (${e.source_kind || "?"}) ${e.content}`)
    .join("\n\n");

  // gpt-4o-mini for cost — this is a structured summary, not
  // open-ended generation. Tight system prompt; one shot.
  const promptBody = {
    model: "gpt-5",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You compress a week of correspondence with a single contact into a concise, useful summary the user can read in 30 seconds before a call or meeting. Output 4-6 bullets in plain markdown. Cover: (1) open promises either side made that haven't closed, (2) recent concerns or hesitations, (3) commitments and next steps, (4) the emotional tone of the relationship right now, (5) anything the user should remember to mention. Be specific. Don't restate the date range. No preamble.",
      },
      {
        role: "user",
        content: `Contact: ${contactName || "(unnamed)"}\n\nLast 7 days of episodes (most recent at the bottom):\n\n${transcript}`,
      },
    ],
  };

  let summary: string;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify(promptBody),
    });
    if (!res.ok) {
      return { ok: false, error: `openai ${res.status}` };
    }
    const j = await res.json();
    summary = (j.choices?.[0]?.message?.content || "").trim();
    if (!summary) return { ok: false, error: "empty summary" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "openai failed",
    };
  }

  try {
    await remember({
      workspaceId,
      kind: "summary",
      content: `Weekly rollup (${weekKey}) for ${contactName || contactId}\n\n${summary}`,
      subjectContactId: contactId,
      sourceKind: "workflow",
      sourceId,
    });
    return { ok: true, written: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "remember failed",
    };
  }
}

async function handle(req: Request) {
  if (!authOk(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json(
      { ok: false, skipped: "no_openai_key" },
      { status: 200 },
    );
  }

  const weekKey = isoWeekKey(new Date());

  // Find contacts active in the last week — across ALL workspaces.
  // We get distinct (workspace_id, subject_contact_id) pairs from
  // recent episode rows, count by pair, filter ≥ MIN_EPISODES.
  const since = new Date(Date.now() - ROLLUP_LOOKBACK_DAYS * 86400_000).toISOString();
  const { data: recentEpisodes } = await supabaseAdmin
    .from("dante_memory")
    .select("workspace_id, subject_contact_id")
    .eq("kind", "episode")
    .is("superseded_by", null)
    .not("subject_contact_id", "is", null)
    .gte("created_at", since)
    .limit(10000);

  if (!recentEpisodes || recentEpisodes.length === 0) {
    return NextResponse.json({ ok: true, weekKey, summarized: 0, skipped: 0 });
  }

  const counts = new Map<string, number>();
  for (const r of recentEpisodes as any[]) {
    if (!r.workspace_id || !r.subject_contact_id) continue;
    const k = `${r.workspace_id}::${r.subject_contact_id}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }

  const candidates: Array<{ workspaceId: string; contactId: string }> = [];
  for (const [k, c] of counts.entries()) {
    if (c < MIN_EPISODES) continue;
    const [workspaceId, contactId] = k.split("::");
    candidates.push({ workspaceId, contactId });
  }

  // Cap per-workspace to avoid one busy workspace eating the budget.
  const perWorkspace = new Map<string, number>();
  const filtered = candidates.filter((c) => {
    const n = perWorkspace.get(c.workspaceId) || 0;
    if (n >= MAX_CONTACTS_PER_WORKSPACE) return false;
    perWorkspace.set(c.workspaceId, n + 1);
    return true;
  });

  // Resolve contact names in one query so we don't fan out per row.
  const contactIds = Array.from(new Set(filtered.map((c) => c.contactId)));
  const { data: contactRows } = await supabaseAdmin
    .from("contacts")
    .select("id, name")
    .in("id", contactIds);
  const contactName = new Map<string, string>(
    (contactRows || []).map((c: any) => [c.id, c.name as string]),
  );

  let summarized = 0;
  let skipped = 0;
  let errored = 0;
  for (const { workspaceId, contactId } of filtered) {
    const result = await rollupContact({
      workspaceId,
      contactId,
      contactName: contactName.get(contactId) || null,
      weekKey,
      openaiKey,
    });
    if (!result.ok) {
      errored++;
      console.error(
        `[memory-rollup] ${workspaceId}/${contactId}:`,
        result.error,
      );
      continue;
    }
    if (result.written) summarized++;
    else skipped++;
  }

  return NextResponse.json({
    ok: true,
    weekKey,
    candidates: filtered.length,
    summarized,
    skipped,
    errored,
  });
}

export const GET = handle;
export const POST = handle;
