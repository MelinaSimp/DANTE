-- 20260502_billing_and_rate_limit.sql
--
-- Phase 2 W2.5 — schema for the metered billing aggregator
-- (lib/billing/aggregator.ts) and rate limiter (lib/rate-limit/
-- limiter.ts).

-- ── usage_events: add the reporting columns ──────────────────────
--
-- The table likely already exists; add the columns the aggregator
-- needs. Existing schemas with a different shape can ignore the
-- column-already-exists noise.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'usage_events'
  ) THEN
    EXECUTE '
      ALTER TABLE usage_events
        ADD COLUMN IF NOT EXISTS stripe_reported boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS stripe_reported_at timestamptz,
        ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();
    ';
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_usage_events_unreported
        ON usage_events (occurred_at)
        WHERE stripe_reported = false;
    ';
  ELSE
    -- Cold-start workspaces — create the canonical table.
    CREATE TABLE usage_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      kind text NOT NULL,
      quantity bigint NOT NULL DEFAULT 1,
      cost_cents bigint NOT NULL DEFAULT 0,
      model text,
      feature text,
      metadata jsonb,
      stripe_reported boolean NOT NULL DEFAULT false,
      stripe_reported_at timestamptz,
      occurred_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_usage_events_unreported ON usage_events (occurred_at)
      WHERE stripe_reported = false;
    CREATE INDEX idx_usage_events_workspace ON usage_events (workspace_id, occurred_at DESC);
  END IF;
END $$;

-- ── workspace_billing_meters ─────────────────────────────────────
--
-- Maps each (workspace, metered kind) to a Stripe subscription_item.
-- Configured at workspace billing setup; rows missing here cause the
-- aggregator to skip that meter for that workspace (sales rep would
-- backfill manually).

CREATE TABLE IF NOT EXISTS workspace_billing_meters (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL,
  stripe_subscription_item_id text NOT NULL,
  unit_label text,                                    -- "tokens","emails","minutes"
  -- Per-vertical pricing tier this meter is associated with. Helps
  -- the parity scorecard show "advisor: 47 metered workspaces,
  -- realtor: 12" without joining through Stripe.
  vertical text CHECK (vertical IN ('financial_advisor', 'real_estate')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, kind)
);

ALTER TABLE workspace_billing_meters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_meters_select ON workspace_billing_meters;
CREATE POLICY billing_meters_select ON workspace_billing_meters
  FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- ── rate_limit_buckets ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  tokens int NOT NULL,
  capacity int NOT NULL,
  refill_per_min int NOT NULL,
  last_refill_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, bucket)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_recent
  ON rate_limit_buckets (workspace_id, updated_at DESC);

-- No RLS needed — service role only. App code hits supabaseAdmin.
COMMENT ON TABLE rate_limit_buckets IS
  'Phase 2 W2.5 — token-bucket rate limiter state. Service-role only; app reads/writes via lib/rate-limit/limiter.ts.';
COMMENT ON TABLE workspace_billing_meters IS
  'Phase 2 W2.5 — workspace × metered-kind → Stripe subscription_item mapping for the metered billing aggregator.';
