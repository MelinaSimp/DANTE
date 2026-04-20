// lib/dante/churn-events.ts
//
// Append-only signal log for churn prediction.
//
// Every time a contact does something meaningful (schedules an appt,
// finishes a call, interacts with the voice agent, goes quiet for a
// month), we append a row to `dante_churn_events` with:
//
//   - a signal value in [-1.0, +1.0]   (positive = engaged, negative = churning)
//   - a weight in (0, ~3.0]            (importance / trust of this signal)
//   - metadata for debugging later
//
// Phase 1 of Dante was a rule-based churn score that queried current
// state (last appointment, recent calls). Phase 2 (this file) starts
// accumulating a time series so we can eventually train on it. The
// scorer will learn to trust event types that correlate with churn
// instead of our hardcoded weights.
//
// Callers fire-and-forget — never block user paths on this. All
// inserts go through the service-role client so RLS doesn't bite us
// in webhook handlers where auth.uid() is null.

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Event catalog ─────────────────────────────────────────────
// Keep this list closed. New event types get added here explicitly
// so the scorer always knows what weight to apply.

export type ChurnEventType =
  // Positive — the contact is taking action / engaging
  | "appointment_scheduled"
  | "appointment_attended"
  | "call_completed"
  | "call_completed_long"      // > 5 min call, stronger signal
  | "agent_interaction"
  | "agent_interaction_positive"
  | "note_added"
  | "email_opened"
  | "email_clicked"
  // Negative — the contact is pulling away
  | "appointment_no_show"
  | "appointment_cancelled"
  | "agent_interaction_negative"
  | "email_bounced"
  | "stale_contact_30d"        // synthesised: no activity for 30d
  | "stale_contact_90d";

// Default signal + weight per event type. The scorer can override
// these at runtime; having them here gives us sensible defaults when
// nobody's tuned the weights yet.
const EVENT_DEFAULTS: Record<ChurnEventType, { signal: number; weight: number }> = {
  appointment_scheduled:       { signal: +0.5, weight: 1.0 },
  appointment_attended:        { signal: +0.8, weight: 1.5 },
  call_completed:              { signal: +0.3, weight: 0.8 },
  call_completed_long:         { signal: +0.6, weight: 1.2 },
  agent_interaction:           { signal: +0.2, weight: 0.6 },
  agent_interaction_positive:  { signal: +0.6, weight: 1.0 },
  note_added:                  { signal: +0.1, weight: 0.4 },
  email_opened:                { signal: +0.2, weight: 0.5 },
  email_clicked:               { signal: +0.5, weight: 0.8 },
  appointment_no_show:         { signal: -0.8, weight: 1.8 },
  appointment_cancelled:       { signal: -0.3, weight: 1.0 },
  agent_interaction_negative:  { signal: -0.6, weight: 1.2 },
  email_bounced:               { signal: -0.4, weight: 0.6 },
  stale_contact_30d:           { signal: -0.3, weight: 0.8 },
  stale_contact_90d:           { signal: -0.7, weight: 1.5 },
};

export interface LogChurnEventInput {
  workspace_id: string;
  contact_id: string;
  event_type: ChurnEventType;
  /** Override the default signal for this event (optional). */
  signal?: number;
  /** Override the default weight for this event (optional). */
  weight?: number;
  /** Free-form context — e.g. call duration, sentiment score, appointment id. */
  metadata?: Record<string, unknown>;
  /** Short tag for where this came from ("appointments", "retell", "vapi", "calls"). */
  source?: string;
  /** External id (appointment id, call id, conversation id) so we can trace back. */
  source_id?: string | null;
}

/**
 * Fire-and-forget insert. Errors are swallowed + logged — this must
 * never break the caller's path. If the migration hasn't run yet this
 * just no-ops.
 */
export async function logChurnEvent(input: LogChurnEventInput): Promise<void> {
  const defaults = EVENT_DEFAULTS[input.event_type];
  const signal = clamp(input.signal ?? defaults.signal, -1, 1);
  const weight = Math.max(0, input.weight ?? defaults.weight);

  try {
    const { error } = await supabaseAdmin
      .from("dante_churn_events")
      .insert({
        workspace_id: input.workspace_id,
        contact_id: input.contact_id,
        event_type: input.event_type,
        signal,
        weight,
        metadata: input.metadata ?? {},
        source: input.source ?? null,
        source_id: input.source_id ?? null,
      });
    if (error && !isMissingTableError(error)) {
      console.warn("[dante] logChurnEvent failed:", error.message);
    }
  } catch (err) {
    console.warn("[dante] logChurnEvent threw:", err instanceof Error ? err.message : err);
  }
}

/**
 * Version of logChurnEvent you can `await` but that still resolves
 * even on failure. Use when you want to batch several signals in a
 * single webhook handler.
 */
export async function logChurnEvents(inputs: LogChurnEventInput[]): Promise<void> {
  await Promise.all(inputs.map((i) => logChurnEvent(i)));
}

// ── Helpers ───────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isMissingTableError(err: { code?: string; message?: string }): boolean {
  // Postgres "relation ... does not exist" is 42P01. Before the
  // migration lands we'd rather silently no-op than noise the logs.
  return err.code === "42P01" || (err.message?.includes("dante_churn_events") ?? false);
}

// ── Aggregation for the scorer ────────────────────────────────
//
// Until we have enough data to fit a model, the scorer rolls events
// up into a single "engagement delta" per contact: Σ(signal × weight
// × recency_decay). Recency decay is an exponential with a 30-day
// half-life so old events fade but never vanish.

export interface ChurnEventRow {
  contact_id: string;
  event_type: ChurnEventType;
  signal: number;
  weight: number;
  created_at: string;
}

/** Half-life in days for the exponential decay of event signals. */
const HALF_LIFE_DAYS = 30;

/**
 * Score = Σ (signal × weight × decay). Positive = healthy, negative =
 * churning. Typical range after decay is roughly [-5, +5], but no
 * hard bound.
 */
export function rollupEngagement(events: ChurnEventRow[], now: Date = new Date()): number {
  let total = 0;
  for (const e of events) {
    const ageDays = (now.getTime() - new Date(e.created_at).getTime()) / 86_400_000;
    const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    total += e.signal * e.weight * decay;
  }
  return total;
}

/**
 * Fetch all events for a workspace within a lookback window (default
 * 180 days — long enough that the 30-day half-life has decayed to
 * ~1.5% so it doesn't matter if we include older).
 */
export async function fetchRecentEvents(
  workspace_id: string,
  opts: { lookbackDays?: number; contactIds?: string[] } = {},
): Promise<ChurnEventRow[]> {
  const lookback = opts.lookbackDays ?? 180;
  const cutoff = new Date(Date.now() - lookback * 86_400_000).toISOString();

  let q = supabaseAdmin
    .from("dante_churn_events")
    .select("contact_id, event_type, signal, weight, created_at")
    .eq("workspace_id", workspace_id)
    .gte("created_at", cutoff);

  if (opts.contactIds && opts.contactIds.length > 0) {
    q = q.in("contact_id", opts.contactIds);
  }

  const { data, error } = await q;
  if (error) {
    if (!isMissingTableError(error)) console.warn("[dante] fetchRecentEvents:", error.message);
    return [];
  }
  return (data as ChurnEventRow[]) ?? [];
}
