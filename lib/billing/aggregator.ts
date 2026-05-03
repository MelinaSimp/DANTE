// lib/billing/aggregator.ts
//
// Phase 2 W2.5 — Stripe metered billing aggregator.
//
// Drift writes one row per metered event (LLM token batch, email
// send, SMS, voice minute, vault byte uploaded, workflow run) into
// usage_events. Stripe's metered-billing API wants summarized
// "usage_record" submissions per (subscription_item, period). This
// module is the bridge: scan unsynced usage_events, group, sum,
// submit to Stripe, mark stripe_reported.
//
// Designed to run from a cron (Vercel cron, separate worker, or
// `scripts/billing-sync.ts` for ad-hoc reruns). Idempotent on the
// `stripe_reported` boolean — re-running won't double-charge.
//
// Phase 2 ships the aggregator skeleton + the SQL wiring; the live
// Stripe call sites are gated behind `STRIPE_METERED_ENABLED=1` so
// the code can be merged before pricing tiers ship. That gate flips
// when the SKU surface (advisor / realtor editions × tiers) is
// finalized — see ADR 0002.

import { supabaseAdmin } from "@/lib/supabase/admin";

// Stripe is imported lazily so workspaces without billing keys can
// still run the aggregator in dry-run mode for parity testing.
type StripeClient = {
  subscriptionItems: {
    createUsageRecord: (
      subscriptionItem: string,
      params: { quantity: number; timestamp?: number; action?: "set" | "increment" },
    ) => Promise<unknown>;
  };
};

let stripeClient: StripeClient | null = null;

async function getStripeClient(): Promise<StripeClient | null> {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // Lazy import — keeps `stripe` out of the cold-start path for any
  // route that doesn't actually call this module.
  const StripeMod = (await import("stripe")).default as unknown as new (
    k: string,
    o?: unknown,
  ) => StripeClient;
  stripeClient = new StripeMod(key, { apiVersion: "2024-06-20" });
  return stripeClient;
}

// ── Aggregation primitives ───────────────────────────────────────

export type MeteredKind =
  | "llm.tokens"          // sum of usage_events.quantity (tokens)
  | "email.sent"          // count of usage_events
  | "sms.sent"
  | "voice.minutes"       // sum of usage_events.quantity (minutes)
  | "vault.bytes_uploaded"
  | "workflow.runs";

interface AggregatedRow {
  workspace_id: string;
  kind: MeteredKind;
  total_quantity: number;
  earliest_event: string;     // ISO
  latest_event: string;       // ISO
  event_count: number;
}

interface SyncResult {
  workspaces_touched: number;
  rows_aggregated: number;
  events_marked_reported: number;
  stripe_calls: number;
  dry_run: boolean;
  errors: Array<{ workspace_id: string; kind: string; error: string }>;
}

/**
 * Top-level entry point. Aggregates all `stripe_reported = false`
 * rows in usage_events, submits to Stripe (when configured), and
 * marks reported.
 *
 * Pass `dryRun: true` (or omit STRIPE_SECRET_KEY) to compute the
 * aggregate without submitting. Useful for the parity scorecard's
 * per-vertical telemetry check.
 */
export async function syncMeteredUsage(opts?: {
  dryRun?: boolean;
}): Promise<SyncResult> {
  const stripe = await getStripeClient();
  const dryRun = opts?.dryRun === true || !stripe || process.env.STRIPE_METERED_ENABLED !== "1";

  const result: SyncResult = {
    workspaces_touched: 0,
    rows_aggregated: 0,
    events_marked_reported: 0,
    stripe_calls: 0,
    dry_run: dryRun,
    errors: [],
  };

  // 1. Pull unreported events. We page through to avoid loading huge
  //    result sets into memory; in practice each daily batch is small.
  const PAGE = 1000;
  let offset = 0;
  const aggregates = new Map<string, AggregatedRow>(); // key: ws_id|kind
  const eventIdsByKey = new Map<string, string[]>();

  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("usage_events")
      .select("id, workspace_id, kind, quantity, occurred_at")
      .eq("stripe_reported", false)
      .order("occurred_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`usage_events scan: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as Array<{
      id: string;
      workspace_id: string;
      kind: string;
      quantity: number;
      occurred_at: string;
    }>) {
      if (!METERED_KINDS.has(row.kind as MeteredKind)) continue;
      const key = `${row.workspace_id}|${row.kind}`;
      const agg = aggregates.get(key);
      if (!agg) {
        aggregates.set(key, {
          workspace_id: row.workspace_id,
          kind: row.kind as MeteredKind,
          total_quantity: row.quantity || 0,
          earliest_event: row.occurred_at,
          latest_event: row.occurred_at,
          event_count: 1,
        });
      } else {
        agg.total_quantity += row.quantity || 0;
        agg.event_count += 1;
        if (row.occurred_at > agg.latest_event) agg.latest_event = row.occurred_at;
      }
      const ids = eventIdsByKey.get(key) ?? [];
      ids.push(row.id);
      eventIdsByKey.set(key, ids);
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  result.rows_aggregated = aggregates.size;
  result.workspaces_touched = new Set(
    Array.from(aggregates.values()).map((a) => a.workspace_id),
  ).size;

  // 2. Submit (or skip in dry-run). We pull each workspace's
  //    subscription_item mapping once per kind from
  //    workspace_billing_meters.
  for (const [key, agg] of aggregates) {
    try {
      if (!dryRun && stripe) {
        const subItem = await getSubscriptionItem(agg.workspace_id, agg.kind);
        if (!subItem) {
          // Workspace not configured for this metered kind — common in
          // the rollout window. Mark reported (so we don't re-aggregate
          // forever) and continue.
          result.errors.push({
            workspace_id: agg.workspace_id,
            kind: agg.kind,
            error: "no_subscription_item",
          });
        } else {
          await stripe.subscriptionItems.createUsageRecord(subItem, {
            quantity: Math.floor(agg.total_quantity),
            timestamp: Math.floor(new Date(agg.latest_event).getTime() / 1000),
            action: "increment",
          });
          result.stripe_calls += 1;
        }
      }

      // Mark events reported regardless of dry-run for the dry-run
      // case we've intentionally seeded — but only when not dry-run.
      // Real flow: we only mark after a successful Stripe submit (or
      // the no_subscription_item shortcut).
      if (!dryRun) {
        const ids = eventIdsByKey.get(key) || [];
        if (ids.length > 0) {
          const { error } = await supabaseAdmin
            .from("usage_events")
            .update({ stripe_reported: true, stripe_reported_at: new Date().toISOString() })
            .in("id", ids);
          if (error) throw new Error(`mark_reported: ${error.message}`);
          result.events_marked_reported += ids.length;
        }
      }
    } catch (err) {
      result.errors.push({
        workspace_id: agg.workspace_id,
        kind: agg.kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

const METERED_KINDS = new Set<MeteredKind>([
  "llm.tokens",
  "email.sent",
  "sms.sent",
  "voice.minutes",
  "vault.bytes_uploaded",
  "workflow.runs",
]);

async function getSubscriptionItem(
  workspaceId: string,
  kind: MeteredKind,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("workspace_billing_meters")
    .select("stripe_subscription_item_id")
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .maybeSingle();
  return (data as { stripe_subscription_item_id?: string } | null)
    ?.stripe_subscription_item_id ?? null;
}
