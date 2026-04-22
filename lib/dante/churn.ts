// lib/dante/churn.ts
//
// Dante — churn prediction engine (v1, rule-based).
//
// Input: a workspace_id. For every contact in that workspace we pull
// the signals below, normalize them to [0, 1], weight them, and emit
// a 0–100 "at-risk" score plus a tier label and a JSON signal bundle.
//
// Signals considered (v1):
//   1. Recency        — days since last touch (appt, note, or call)
//   2. Attendance     — ratio of completed vs. no-show/cancelled appts
//   3. Engagement     — touches in the last 90 days
//   4. Call sentiment — keyword heuristic over call summaries
//   5. Trajectory     — are the gaps between touches widening?
//
// Why rule-based for v1: it's explainable. An advisor can see the
// signal breakdown and go "yep, she hasn't answered in 4 months, and
// the last call summary had 'frustrated' in it — checks out." Phase 2
// replaces the weighted sum with an ML model trained on whether the
// contact was actually lost, but keeps the same signal extraction.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchRecentEvents, rollupEngagement } from "./churn-events";

// ── Types ─────────────────────────────────────────────────────

export type ChurnTier = "healthy" | "watch" | "at_risk" | "critical";

export interface ChurnSignal {
  key: string;
  label: string;
  raw: number | string | null;
  normalized: number; // [0, 1], 1 = worst
  weight: number;     // contribution out of 1
  contribution: number; // normalized * weight, summed → score/100
  detail?: string;
}

export interface ChurnScore {
  contact_id: string;
  score: number;              // 0-100, higher = more at-risk
  tier: ChurnTier;
  signals: ChurnSignal[];
  computed_at: string;
}

// ── Tuning knobs ──────────────────────────────────────────────
// These weights sum to 1.0. If you add a signal, update WEIGHTS and
// re-run. The tier cutoffs below determine what renders as red vs.
// amber vs. green on the dashboard.

// Phase-2 update: we now also consume the `dante_churn_events` time
// series. The existing signals still fire against current-state
// queries; the new `events` signal folds in the rolled-up engagement
// delta with 30-day half-life decay. When the events table is empty
// `eventsNorm()` returns the neutral 0.4 so nothing breaks.
const WEIGHTS = {
  recency: 0.25,
  attendance: 0.15,
  engagement: 0.15,
  sentiment: 0.10,
  trajectory: 0.10,
  events: 0.25,
} as const;

const TIER_CUTOFFS: Array<[ChurnTier, number]> = [
  ["critical", 75],
  ["at_risk", 55],
  ["watch", 30],
  ["healthy", 0],
];

function tierFor(score: number): ChurnTier {
  for (const [tier, min] of TIER_CUTOFFS) {
    if (score >= min) return tier;
  }
  return "healthy";
}

// ── Signal extractors ─────────────────────────────────────────

const DAY_MS = 86_400_000;

// Recency: map "days since last touch" to [0, 1] with a soft cap.
// 0 days → 0.00, 30 days → 0.40, 90 days → 0.80, 180+ → 1.00.
function recencyNorm(days: number): number {
  if (days <= 0) return 0;
  if (days >= 180) return 1;
  return Math.min(1, days / 180);
}

// Attendance: 1 − (completed / total). No appts at all → neutral 0.4.
function attendanceNorm(completed: number, noShow: number, cancelled: number): number {
  const total = completed + noShow + cancelled;
  if (total === 0) return 0.4;
  const badRatio = (noShow + cancelled) / total;
  return Math.min(1, badRatio);
}

// Engagement: fewer touches in the last 90 days is worse. 8+ → 0.0,
// 0 touches → 1.0. Scaled linearly in between.
function engagementNorm(touchesLast90: number): number {
  if (touchesLast90 >= 8) return 0;
  return 1 - touchesLast90 / 8;
}

// Sentiment over recent call summaries. Phase 2: prefer the stored
// LLM-classified sentiment_score (signed [-1,+1]; populated by
// lib/calls/sentiment.ts in both the manual and inbound-audit flows).
// Rows without a stored score (older calls, or calls where the
// classifier failed) fall back to the v1 keyword heuristic.
const NEGATIVE_TOKENS = [
  "frustrat", "angry", "upset", "disappoint", "concern", "confus",
  "unhappy", "complain", "wrong", "error", "problem", "issue",
  "cancel", "leave", "switch", "competitor", "not satisfied",
];

type CallForSentiment = {
  summary: string | null;
  sentiment_score: number | null;
};

function sentimentNorm(calls: CallForSentiment[]): {
  norm: number;
  hits: string[];
  detail: string | null;
} {
  if (calls.length === 0) return { norm: 0.35, hits: [], detail: null };

  // Prefer stored scores — average across calls that have one. Map the
  // signed [-1, +1] range to our [0, 1] at-risk scale: +1 → 0.0 (best),
  //  0 → 0.5, -1 → 1.0 (worst).
  const scored = calls
    .map((c) => c.sentiment_score)
    .filter((s): s is number => typeof s === "number");
  if (scored.length > 0) {
    const avg = scored.reduce((a, b) => a + b, 0) / scored.length;
    const norm = Math.min(1, Math.max(0, (1 - avg) / 2));
    return {
      norm,
      hits: [],
      detail: `LLM sentiment avg ${avg.toFixed(2)} over ${scored.length} call${scored.length === 1 ? "" : "s"}`,
    };
  }

  // Fallback: keyword scan over summaries (legacy rows, or classifier misses).
  const summaries = calls
    .map((c) => c.summary)
    .filter((s): s is string => !!s);
  if (summaries.length === 0) return { norm: 0.35, hits: [], detail: null };
  const joined = summaries.join(" ").toLowerCase();
  const hits = NEGATIVE_TOKENS.filter((tok) => joined.includes(tok));
  // 0 hits → 0.10, 3 hits → 0.70, 5+ → 1.00
  return {
    norm: Math.min(1, hits.length / 5),
    hits,
    detail: hits.length ? `Flagged: ${hits.slice(0, 3).join(", ")}` : null,
  };
}

// Trajectory: are the gaps between touches getting longer? Compare
// median of last 3 gaps to median of the prior 3. Ratio > 2 = bad.
function trajectoryNorm(touchDates: Date[]): number {
  if (touchDates.length < 6) return 0.3; // not enough signal yet
  const sorted = [...touchDates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / DAY_MS);
  }
  const recent3 = median(gaps.slice(-3));
  const prior3 = median(gaps.slice(-6, -3));
  if (prior3 === 0) return 0.3;
  const ratio = recent3 / prior3;
  if (ratio <= 1) return 0;
  if (ratio >= 3) return 1;
  return (ratio - 1) / 2;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Events signal: rolled-up engagement delta → [0, 1] where 1 = worst.
// rollupEngagement() returns a number roughly in [-5, +5] with 0 =
// neutral, positive = engaged, negative = churning. We map it onto
// our at-risk scale so that negative engagement pushes the score up.
//   +2 or more  → 0.00   (strongly engaged, brings score down)
//    0          → 0.40   (neutral, same default as other signals)
//   -2          → 0.80
//   -4 or less  → 1.00   (heavy negative signal)
function eventsNorm(engagement: number, sampleCount: number): number {
  if (sampleCount === 0) return 0.4; // no data yet
  if (engagement >=  2) return 0;
  if (engagement <= -4) return 1;
  // Linear from (+2, 0) through (0, 0.4) to (-4, 1).
  // Piecewise: above 0 → scale 0→0.4 on [+2, 0]; below 0 → 0.4→1 on [0, -4].
  if (engagement >= 0) return 0.4 * (1 - engagement / 2);
  return 0.4 + 0.6 * Math.min(1, -engagement / 4);
}

// ── Main ──────────────────────────────────────────────────────

/**
 * Recompute churn for every contact in the workspace and upsert the
 * result into dante_churn_scores. Returns the array of fresh scores.
 */
export async function recomputeChurnForWorkspace(
  workspaceId: string
): Promise<ChurnScore[]> {
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, name, created_at")
    .eq("workspace_id", workspaceId);

  if (!contacts?.length) return [];

  // Pull all churn events for this workspace in one shot (180-day
  // window — older events are essentially decayed to zero anyway).
  // This beats N+1 fetches per contact.
  const allEvents = await fetchRecentEvents(workspaceId, { lookbackDays: 180 });
  const eventsByContact = new Map<string, typeof allEvents>();
  for (const e of allEvents) {
    const arr = eventsByContact.get(e.contact_id) || [];
    arr.push(e);
    eventsByContact.set(e.contact_id, arr);
  }

  const scores: ChurnScore[] = [];
  const now = Date.now();

  for (const contact of contacts) {
    const [notesRes, apptsRes, callsRes] = await Promise.all([
      supabaseAdmin
        .from("notes")
        .select("created_at")
        .eq("contact_id", contact.id)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("appointments")
        .select("scheduled_at, status, created_at")
        .eq("contact_id", contact.id)
        .eq("workspace_id", workspaceId)
        .order("scheduled_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("call_recordings")
        .select("created_at, summary, duration_seconds, status, sentiment_score, sentiment_label")
        .eq("contact_id", contact.id)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const notes = notesRes.data ?? [];
    const appts = apptsRes.data ?? [];
    const calls = callsRes.data ?? [];

    // Touch dates = union of every recorded interaction.
    const touchDates: Date[] = [
      ...notes.map((n) => new Date(n.created_at)),
      ...appts.map((a) => new Date(a.scheduled_at)),
      ...calls.map((c) => new Date(c.created_at)),
    ];

    const lastTouch = touchDates.length
      ? new Date(Math.max(...touchDates.map((d) => d.getTime())))
      : new Date(contact.created_at);
    const daysSince = Math.max(0, Math.floor((now - lastTouch.getTime()) / DAY_MS));

    // Attendance — infer from appointment status strings (different
    // workspaces use slightly different casing, so we lowercase).
    let completed = 0, noShow = 0, cancelled = 0;
    for (const a of appts) {
      const s = (a.status || "").toLowerCase();
      if (s.includes("complete") || s.includes("done") || s.includes("held")) completed++;
      else if (s.includes("no") && s.includes("show")) noShow++;
      else if (s.includes("cancel")) cancelled++;
    }

    // Engagement — touches in last 90 days.
    const cutoff90 = now - 90 * DAY_MS;
    const touchesLast90 = touchDates.filter((d) => d.getTime() >= cutoff90).length;

    // Sentiment — prefer stored LLM scores, fall back to keyword hits.
    const callsForSentiment: CallForSentiment[] = calls.map((c) => ({
      summary: c.summary ?? null,
      sentiment_score:
        typeof c.sentiment_score === "number" ? c.sentiment_score : null,
    }));
    const sentiment = sentimentNorm(callsForSentiment);
    const hasScoredCalls = callsForSentiment.some(
      (c) => c.sentiment_score !== null
    );

    // Trajectory.
    const traj = trajectoryNorm(touchDates);

    // Build the signal breakdown.
    const signals: ChurnSignal[] = [
      {
        key: "recency",
        label: "Days since last touch",
        raw: daysSince,
        normalized: recencyNorm(daysSince),
        weight: WEIGHTS.recency,
        contribution: recencyNorm(daysSince) * WEIGHTS.recency,
        detail: `Last touch ${daysSince}d ago`,
      },
      {
        key: "attendance",
        label: "Meeting attendance",
        raw: completed + noShow + cancelled === 0
          ? "no history"
          : `${completed}/${completed + noShow + cancelled} kept`,
        normalized: attendanceNorm(completed, noShow, cancelled),
        weight: WEIGHTS.attendance,
        contribution: attendanceNorm(completed, noShow, cancelled) * WEIGHTS.attendance,
        detail: noShow > 0 ? `${noShow} no-shows` : cancelled > 0 ? `${cancelled} cancelled` : undefined,
      },
      {
        key: "engagement",
        label: "Touches in last 90 days",
        raw: touchesLast90,
        normalized: engagementNorm(touchesLast90),
        weight: WEIGHTS.engagement,
        contribution: engagementNorm(touchesLast90) * WEIGHTS.engagement,
        detail: `${touchesLast90} interactions in 90d`,
      },
      (() => {
        const hasCalls = callsForSentiment.length > 0;
        const raw = hasScoredCalls
          ? "LLM-scored"
          : sentiment.hits.length > 0
          ? `${sentiment.hits.length} flag(s)`
          : hasCalls
          ? "neutral"
          : "no calls";
        return {
          key: "sentiment",
          label: "Call sentiment signal",
          raw,
          normalized: sentiment.norm,
          weight: WEIGHTS.sentiment,
          contribution: sentiment.norm * WEIGHTS.sentiment,
          detail: sentiment.detail ?? undefined,
        };
      })(),
      {
        key: "trajectory",
        label: "Contact gap trajectory",
        raw: touchDates.length < 6 ? "not enough data" : traj < 0.2 ? "stable" : traj < 0.6 ? "widening" : "widening fast",
        normalized: traj,
        weight: WEIGHTS.trajectory,
        contribution: traj * WEIGHTS.trajectory,
      },
      (() => {
        const events = eventsByContact.get(contact.id) || [];
        const engagement = rollupEngagement(events);
        const norm = eventsNorm(engagement, events.length);
        return {
          key: "events",
          label: "Engagement signal log",
          raw: events.length === 0
            ? "no events logged yet"
            : `${events.length} events, Δ${engagement.toFixed(1)}`,
          normalized: norm,
          weight: WEIGHTS.events,
          contribution: norm * WEIGHTS.events,
          detail: events.length === 0
            ? "Start logging signals to improve accuracy"
            : engagement > 0 ? "Net positive engagement"
            : engagement < 0 ? "Net negative engagement"
            : "Neutral",
        };
      })(),
    ];

    const score = Math.round(
      signals.reduce((s, sig) => s + sig.contribution, 0) * 100
    );
    const tier = tierFor(score);

    scores.push({
      contact_id: contact.id,
      score,
      tier,
      signals,
      computed_at: new Date().toISOString(),
    });
  }

  // Upsert all rows in a single batch.
  if (scores.length) {
    const { error } = await supabaseAdmin.from("dante_churn_scores").upsert(
      scores.map((s) => ({
        workspace_id: workspaceId,
        contact_id: s.contact_id,
        score: s.score,
        tier: s.tier,
        signals: s.signals,
        computed_at: s.computed_at,
      })),
      { onConflict: "workspace_id,contact_id" }
    );
    if (error) throw new Error(`Churn upsert failed: ${error.message}`);
  }

  return scores;
}
