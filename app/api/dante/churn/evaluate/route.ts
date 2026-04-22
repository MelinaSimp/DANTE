// app/api/dante/churn/evaluate/route.ts
//
// Backtest the Dante churn signal against a simple outcome proxy.
// Answers: "If we had ranked contacts by at-risk score 90 days ago,
// would the ones at the top actually have gone quiet since?"
//
// This is how we stop asserting that the model works and start
// measuring it.
//
// ── What we compute ──
// For each contact, we reconstruct a historical at-risk score as of
// T0 = today - HORIZON_DAYS (default 90). We only use signal rows
// created on or before T0, so we're not leaking outcome data into
// the predictor.
//
// Outcome proxy: "churned" = no new touch between T0 and today.
// "active" = at least one new touch. This isn't a real churn label
// — advisors rarely mark a contact as lost — but silence is a strong
// leading indicator, and it's the best label we can derive from
// existing data without a human in the loop.
//
// ── What we report ──
//   - baseline rate: fraction of contacts that "churned" (by the proxy)
//   - top-K precision at K ∈ {10%, 20%, 30%}: of contacts we scored
//     highest-risk at T0, how many actually churned?
//   - lift vs. baseline: precision / baseline (1.0 = no better than
//     random; 2.0 = the top slice catches twice as many as chance)
//   - AUC-ROC: standard classifier metric, insensitive to K
//
// ── Honest caveats (surfaced in response) ──
//   - outcome is silence-proxy, not a confirmed lost client
//   - thin workspaces (< 30 contacts with any history) produce noise
//   - we score all contacts, but include only those with any pre-T0
//     activity in the evaluation — contacts created after T0 can't
//     be backtested and are excluded from metrics
//
// Only superadmins can run this for now — it's an internal quality
// check, not a user-facing feature.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DAY_MS = 86_400_000;
const DEFAULT_HORIZON_DAYS = 90;
const TOP_K_FRACTIONS = [0.1, 0.2, 0.3] as const;

// Signal weights — mirror lib/dante/churn.ts so the backtest scores
// what the production scorer would have emitted. If you change weights
// there, mirror here.
const WEIGHTS = {
  recency: 0.35,
  engagement: 0.25,
  attendance: 0.2,
  events: 0.2,
} as const;

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, is_superadmin")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!hasSuperadminAccess(auth.user.email, profile?.is_superadmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return runEvaluation({
    workspace_id: profile?.workspace_id || null,
    horizonDays: DEFAULT_HORIZON_DAYS,
  });
}

async function runEvaluation(opts: {
  workspace_id: string | null;
  horizonDays: number;
}) {
  const now = Date.now();
  const t0 = now - opts.horizonDays * DAY_MS;
  const t0Iso = new Date(t0).toISOString();

  // Pull contacts (scoped to caller's workspace, or all if superadmin
  // with no workspace — sanity-cap rows).
  let contactQuery = supabaseAdmin
    .from("contacts")
    .select("id, workspace_id, created_at")
    .lte("created_at", t0Iso) // must exist at T0 to be backtestable
    .limit(5000);
  if (opts.workspace_id) {
    contactQuery = contactQuery.eq("workspace_id", opts.workspace_id);
  }
  const { data: contacts, error: cErr } = await contactQuery;
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!contacts || contacts.length === 0) {
    return NextResponse.json({
      error: "No contacts old enough to backtest",
      horizon_days: opts.horizonDays,
      t0: t0Iso,
    });
  }

  const contactIds = contacts.map((c) => c.id);

  // Pull all activity we need in a few bulk queries rather than N+1.
  const [notesRes, apptsRes, callsRes, eventsRes] = await Promise.all([
    supabaseAdmin
      .from("notes")
      .select("contact_id, created_at")
      .in("contact_id", contactIds),
    supabaseAdmin
      .from("appointments")
      .select("contact_id, scheduled_at, status, created_at")
      .in("contact_id", contactIds),
    supabaseAdmin
      .from("call_recordings")
      .select("contact_id, created_at, sentiment_score")
      .in("contact_id", contactIds),
    supabaseAdmin
      .from("dante_churn_events")
      .select("contact_id, signal, weight, created_at")
      .in("contact_id", contactIds)
      .gte("created_at", new Date(t0 - 180 * DAY_MS).toISOString()),
  ]);

  const notesBy = groupBy(notesRes.data ?? [], "contact_id");
  const apptsBy = groupBy(apptsRes.data ?? [], "contact_id");
  const callsBy = groupBy(callsRes.data ?? [], "contact_id");
  const eventsBy = groupBy(eventsRes.data ?? [], "contact_id");

  interface Row {
    contact_id: string;
    score: number;
    churned: 0 | 1;
  }

  const rows: Row[] = [];

  for (const contact of contacts) {
    // ── Pre-T0 activity (predictor side) ──
    const preNotes = (notesBy.get(contact.id) ?? []).filter(
      (n) => new Date(n.created_at).getTime() <= t0
    );
    const preAppts = (apptsBy.get(contact.id) ?? []).filter((a) => {
      const when = new Date(a.scheduled_at || a.created_at).getTime();
      return when <= t0;
    });
    const preCalls = (callsBy.get(contact.id) ?? []).filter(
      (c) => new Date(c.created_at).getTime() <= t0
    );
    const preEvents = (eventsBy.get(contact.id) ?? []).filter(
      (e) => new Date(e.created_at).getTime() <= t0
    );

    const preTouches = [
      ...preNotes.map((n) => new Date(n.created_at).getTime()),
      ...preAppts.map((a) =>
        new Date(a.scheduled_at || a.created_at).getTime()
      ),
      ...preCalls.map((c) => new Date(c.created_at).getTime()),
    ];

    // Skip contacts with zero pre-T0 activity — they have no signal
    // and would pollute the metric with ties at the extremes.
    if (preTouches.length === 0) continue;

    // ── Historical score at T0 ──
    const lastTouch = Math.max(...preTouches);
    const daysSince = (t0 - lastTouch) / DAY_MS;
    const recencyNorm = Math.min(1, Math.max(0, daysSince / 180));

    const cutoff90 = t0 - 90 * DAY_MS;
    const touchesLast90 = preTouches.filter((t) => t >= cutoff90).length;
    const engagementNorm =
      touchesLast90 >= 8 ? 0 : 1 - touchesLast90 / 8;

    let completed = 0;
    let bad = 0;
    for (const a of preAppts) {
      const s = (a.status || "").toLowerCase();
      if (s.includes("complete") || s.includes("done") || s.includes("held"))
        completed++;
      else if (
        (s.includes("no") && s.includes("show")) ||
        s.includes("cancel")
      )
        bad++;
    }
    const attendanceTotal = completed + bad;
    const attendanceNorm =
      attendanceTotal === 0 ? 0.4 : Math.min(1, bad / attendanceTotal);

    // Event rollup with 30-day half-life, as of T0.
    let eventRoll = 0;
    for (const e of preEvents) {
      const ageDays = (t0 - new Date(e.created_at).getTime()) / DAY_MS;
      const decay = Math.pow(0.5, ageDays / 30);
      eventRoll += Number(e.signal) * Number(e.weight) * decay;
    }
    // Map rollup to [0,1] where 1 = worst (negative engagement).
    // Matches eventsNorm() in lib/dante/churn.ts.
    let eventsNorm: number;
    if (preEvents.length === 0) eventsNorm = 0.4;
    else if (eventRoll >= 2) eventsNorm = 0;
    else if (eventRoll <= -4) eventsNorm = 1;
    else if (eventRoll >= 0) eventsNorm = 0.4 * (1 - eventRoll / 2);
    else eventsNorm = 0.4 + 0.6 * Math.min(1, -eventRoll / 4);

    const score =
      WEIGHTS.recency * recencyNorm +
      WEIGHTS.engagement * engagementNorm +
      WEIGHTS.attendance * attendanceNorm +
      WEIGHTS.events * eventsNorm;

    // ── Outcome (post-T0 touches) ──
    const postNotes = (notesBy.get(contact.id) ?? []).some(
      (n) => new Date(n.created_at).getTime() > t0
    );
    const postAppts = (apptsBy.get(contact.id) ?? []).some((a) => {
      const when = new Date(a.scheduled_at || a.created_at).getTime();
      return when > t0;
    });
    const postCalls = (callsBy.get(contact.id) ?? []).some(
      (c) => new Date(c.created_at).getTime() > t0
    );
    const churned = postNotes || postAppts || postCalls ? 0 : 1;

    rows.push({ contact_id: contact.id, score, churned });
  }

  if (rows.length === 0) {
    return NextResponse.json({
      error: "No contacts with pre-T0 activity",
      horizon_days: opts.horizonDays,
      t0: t0Iso,
    });
  }

  // ── Metrics ─────────────────────────────────────────────────
  const n = rows.length;
  const positives = rows.reduce((s, r) => s + r.churned, 0);
  const baseline = positives / n;

  const sorted = [...rows].sort((a, b) => b.score - a.score);

  const topK = TOP_K_FRACTIONS.map((frac) => {
    const k = Math.max(1, Math.floor(n * frac));
    const slice = sorted.slice(0, k);
    const hits = slice.reduce((s, r) => s + r.churned, 0);
    const precision = hits / k;
    return {
      k,
      fraction: frac,
      precision,
      lift: baseline > 0 ? precision / baseline : null,
    };
  });

  const auc = computeAUC(rows);

  return NextResponse.json({
    horizon_days: opts.horizonDays,
    t0: t0Iso,
    contacts_evaluated: n,
    contacts_churned_proxy: positives,
    baseline_rate: round(baseline, 3),
    auc_roc: round(auc, 3),
    top_k: topK.map((k) => ({
      k: k.k,
      fraction: k.fraction,
      precision: round(k.precision, 3),
      lift_vs_baseline: k.lift === null ? null : round(k.lift, 2),
    })),
    caveats: {
      outcome_definition:
        "silence proxy: no notes/appointments/calls in last " +
        opts.horizonDays +
        " days",
      not_a_real_label:
        "'churned' here means 'went silent', not 'confirmed lost'. Real labels require advisor input.",
      min_contacts_for_stability: 30,
      sample_adequate: n >= 30,
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────

function groupBy<T extends { contact_id: string }>(
  rows: T[],
  _key: "contact_id"
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const arr = m.get(r.contact_id) || [];
    arr.push(r);
    m.set(r.contact_id, arr);
  }
  return m;
}

/**
 * AUC-ROC via the Mann-Whitney-U relation: AUC = P(score_pos > score_neg).
 * O(n log n). Handles ties by awarding 0.5.
 */
function computeAUC(rows: Array<{ score: number; churned: 0 | 1 }>): number {
  const pos = rows.filter((r) => r.churned === 1).map((r) => r.score);
  const neg = rows.filter((r) => r.churned === 0).map((r) => r.score);
  if (pos.length === 0 || neg.length === 0) return 0.5;

  // Sort negatives once, binary-search each positive.
  neg.sort((a, b) => a - b);
  let sum = 0;
  for (const p of pos) {
    // Count negatives strictly less than p (correct rankings).
    let lo = 0;
    let hi = neg.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (neg[mid] < p) lo = mid + 1;
      else hi = mid;
    }
    const strictlyLess = lo;
    // Count ties (negatives == p) — award 0.5 each.
    let hiTie = neg.length;
    let loTie = lo;
    while (loTie < hiTie) {
      const mid = (loTie + hiTie) >> 1;
      if (neg[mid] <= p) loTie = mid + 1;
      else hiTie = mid;
    }
    const ties = loTie - strictlyLess;
    sum += strictlyLess + 0.5 * ties;
  }
  return sum / (pos.length * neg.length);
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
