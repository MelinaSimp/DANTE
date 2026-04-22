// lib/dante/book-summary.ts
//
// A "book summary" is the compact JSON picture of a workspace that the
// workflow proposer feeds to the LLM in Phase 1 ("Understand") of the
// new two-phase generate flow.
//
// The old generator took a prompt like "email me when a contact is
// added" and invented a graph in a vacuum. No sense of how many
// contacts the workspace had, whether there's LLM sentiment data,
// how big the stale cohort is, or what workflows are already running.
// The result was plausible-looking automation that either:
//   - fired for zero contacts (segment didn't exist), or
//   - overlapped with an existing workflow, or
//   - asked for data fields the workspace doesn't populate.
//
// This file produces ground truth the model can anchor to.
//
// We keep it cheap: 5-7 SQL queries, all bounded, 180-day max
// lookback. Never call this on every page load — it's for the
// generate flow only (so maybe a handful of times per advisor per
// week). No caching yet; add one if we see it in traces.

import { supabaseAdmin } from "@/lib/supabase/admin";

const DAY_MS = 86_400_000;

export interface BookSummary {
  workspace_id: string;
  generated_at: string;
  counts: {
    contacts: number;
    calls_last_30d: number;
    appointments_last_30d: number;
    notes_last_30d: number;
  };
  risk_distribution: {
    critical: number;
    act_now: number;
    watch: number;
    healthy: number;
    briefed_contacts: number;
  };
  sentiment: {
    avg_call_sentiment_last_30d: number | null;
    scored_calls_last_30d: number;
  };
  segments: {
    stale_60d: number;   // contacts with no note/appt/call in 60+ days
    new_30d: number;     // contacts created in the last 30 days
    active_30d: number;  // contacts with any touch in last 30 days
  };
  existing_workflows: Array<{
    id: string;
    name: string;
    trigger: string;
    enabled: boolean;
    last_run_status: string | null;
  }>;
}

export async function buildBookSummary(
  workspace_id: string
): Promise<BookSummary> {
  const now = Date.now();
  const t30 = new Date(now - 30 * DAY_MS).toISOString();
  const t60 = new Date(now - 60 * DAY_MS).toISOString();

  // ── Parallel queries for counts ──
  const [
    contactsCount,
    callsCount,
    apptsCount,
    notesCount,
    briefs,
    scoredCalls,
    recentTouches,
    newContacts,
    workflows,
  ] = await Promise.all([
    supabaseAdmin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace_id),
    supabaseAdmin
      .from("call_recordings")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .gte("created_at", t30),
    supabaseAdmin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .gte("created_at", t30),
    supabaseAdmin
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .gte("created_at", t30),
    supabaseAdmin
      .from("dante_briefs")
      .select("risk_level")
      .eq("workspace_id", workspace_id),
    supabaseAdmin
      .from("call_recordings")
      .select("sentiment_score")
      .eq("workspace_id", workspace_id)
      .gte("created_at", t30)
      .not("sentiment_score", "is", null),
    // For stale/active segmentation: pull every touch in the last 60d
    // and infer activity per contact. Bounded — we never join across
    // full tables here.
    pullRecentTouchContactIds(workspace_id, t60),
    supabaseAdmin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .gte("created_at", t30),
    supabaseAdmin
      .from("dante_workflows")
      .select("id, name, trigger, enabled, last_run_status")
      .eq("workspace_id", workspace_id)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  // Risk distribution from cached briefs (lazy-populated; advisors
  // who haven't clicked Rank-my-book will see zeroes, which is honest
  // and useful signal to the proposer — "no briefs yet, suggest the
  // first workflow").
  const riskCounts = { critical: 0, act_now: 0, watch: 0, healthy: 0 };
  for (const b of briefs.data ?? []) {
    const key = (b.risk_level as keyof typeof riskCounts) ?? "healthy";
    if (key in riskCounts) riskCounts[key]++;
  }
  const briefed = (briefs.data ?? []).length;

  // Sentiment average across scored calls.
  const scores = (scoredCalls.data ?? [])
    .map((r) => Number(r.sentiment_score))
    .filter((n) => Number.isFinite(n));
  const avgSent =
    scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

  // Stale/active split.
  const totalContacts = contactsCount.count ?? 0;
  const activeIds = recentTouches;
  const activeCount = activeIds.size;
  const staleCount = Math.max(0, totalContacts - activeCount);

  return {
    workspace_id,
    generated_at: new Date().toISOString(),
    counts: {
      contacts: totalContacts,
      calls_last_30d: callsCount.count ?? 0,
      appointments_last_30d: apptsCount.count ?? 0,
      notes_last_30d: notesCount.count ?? 0,
    },
    risk_distribution: {
      critical: riskCounts.critical,
      act_now: riskCounts.act_now,
      watch: riskCounts.watch,
      healthy: riskCounts.healthy,
      briefed_contacts: briefed,
    },
    sentiment: {
      avg_call_sentiment_last_30d: avgSent,
      scored_calls_last_30d: scores.length,
    },
    segments: {
      stale_60d: staleCount,
      new_30d: newContacts.count ?? 0,
      active_30d: activeCount,
    },
    existing_workflows: (workflows.data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      trigger:
        typeof w.trigger === "object" && w.trigger !== null
          ? (w.trigger as { type?: string }).type || "unknown"
          : String(w.trigger ?? "unknown"),
      enabled: !!w.enabled,
      last_run_status: w.last_run_status ?? null,
    })),
  };
}

// Pull the set of contact_ids with any touch in the last 60 days.
// We only need the identity, not the rows — three parallel queries
// feed into one set.
async function pullRecentTouchContactIds(
  workspace_id: string,
  sinceIso: string
): Promise<Set<string>> {
  const [notes, appts, calls] = await Promise.all([
    supabaseAdmin
      .from("notes")
      .select("contact_id")
      .eq("workspace_id", workspace_id)
      .gte("created_at", sinceIso)
      .limit(5000),
    supabaseAdmin
      .from("appointments")
      .select("contact_id")
      .eq("workspace_id", workspace_id)
      .gte("created_at", sinceIso)
      .limit(5000),
    supabaseAdmin
      .from("call_recordings")
      .select("contact_id")
      .eq("workspace_id", workspace_id)
      .gte("created_at", sinceIso)
      .limit(5000),
  ]);
  const ids = new Set<string>();
  for (const r of notes.data ?? []) if (r.contact_id) ids.add(r.contact_id);
  for (const r of appts.data ?? []) if (r.contact_id) ids.add(r.contact_id);
  for (const r of calls.data ?? []) if (r.contact_id) ids.add(r.contact_id);
  return ids;
}

/**
 * Produce a one-paragraph text summary of the book — for use in
 * system prompts where we want the model to absorb the shape at a
 * glance. Don't bother internationalizing; this is LLM input.
 */
export function renderBookSummaryText(s: BookSummary): string {
  const lines: string[] = [];
  lines.push(
    `Workspace has ${s.counts.contacts} total contact${
      s.counts.contacts === 1 ? "" : "s"
    }.`
  );
  lines.push(
    `Last 30 days: ${s.counts.calls_last_30d} call${
      s.counts.calls_last_30d === 1 ? "" : "s"
    }, ${s.counts.appointments_last_30d} appointment${
      s.counts.appointments_last_30d === 1 ? "" : "s"
    }, ${s.counts.notes_last_30d} note${s.counts.notes_last_30d === 1 ? "" : "s"}.`
  );
  lines.push(
    `Activity segments: ${s.segments.active_30d} active (touched in 30d), ${s.segments.stale_60d} stale (no touch in 60d), ${s.segments.new_30d} created in last 30d.`
  );
  if (s.risk_distribution.briefed_contacts > 0) {
    lines.push(
      `Dante briefs: ${s.risk_distribution.critical} critical, ${s.risk_distribution.act_now} act_now, ${s.risk_distribution.watch} watch, ${s.risk_distribution.healthy} healthy (of ${s.risk_distribution.briefed_contacts} briefed).`
    );
  } else {
    lines.push(`Dante briefs: none yet — advisor hasn't run rank-my-book.`);
  }
  if (s.sentiment.scored_calls_last_30d > 0 && s.sentiment.avg_call_sentiment_last_30d !== null) {
    lines.push(
      `Call sentiment last 30d: avg ${s.sentiment.avg_call_sentiment_last_30d.toFixed(2)} across ${s.sentiment.scored_calls_last_30d} scored calls (range -1 to +1).`
    );
  } else {
    lines.push(`Call sentiment last 30d: no scored calls in window.`);
  }
  if (s.existing_workflows.length > 0) {
    lines.push(
      `Existing workflows (${s.existing_workflows.length}): ${s.existing_workflows
        .map((w) => `"${w.name}" (${w.trigger}${w.enabled ? "" : ", disabled"})`)
        .slice(0, 10)
        .join(", ")}.`
    );
  } else {
    lines.push(`No existing workflows.`);
  }
  return lines.join(" ");
}
