-- Usage metering + billing quotas
-- Records every billable action across the platform so superadmins can
-- monitor over-usage and meter it into Stripe.

CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'llm_tokens_input',
    'llm_tokens_output',
    'email_sent',
    'sms_sent',
    'voice_minutes'
  )),
  quantity NUMERIC NOT NULL CHECK (quantity >= 0),
  cost_cents NUMERIC NOT NULL DEFAULT 0,
  model TEXT,
  source TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  stripe_reported BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_workspace_created
  ON usage_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_workspace_kind_created
  ON usage_events (workspace_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_unreported
  ON usage_events (stripe_reported, created_at) WHERE stripe_reported = false;

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write; never exposed to clients directly.
DROP POLICY IF EXISTS usage_events_service_all ON usage_events;
CREATE POLICY usage_events_service_all ON usage_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Per-workspace quotas and overage billing config.
CREATE TABLE IF NOT EXISTS workspace_quotas (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL DEFAULT 'starter',
  llm_tokens_monthly BIGINT NOT NULL DEFAULT 100000,
  emails_monthly BIGINT NOT NULL DEFAULT 500,
  sms_monthly BIGINT NOT NULL DEFAULT 100,
  voice_minutes_monthly BIGINT NOT NULL DEFAULT 30,
  overage_llm_cents_per_1k NUMERIC NOT NULL DEFAULT 2,
  overage_email_cents NUMERIC NOT NULL DEFAULT 1,
  overage_sms_cents NUMERIC NOT NULL DEFAULT 2,
  overage_voice_cents_per_min NUMERIC NOT NULL DEFAULT 15,
  stripe_subscription_item_id TEXT,
  stripe_customer_id TEXT,
  stripe_meter_event_name TEXT,
  hard_cap BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workspace_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_quotas_service_all ON workspace_quotas;
CREATE POLICY workspace_quotas_service_all ON workspace_quotas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Members can read their own workspace's quotas (for client-side warnings).
DROP POLICY IF EXISTS workspace_quotas_member_read ON workspace_quotas;
CREATE POLICY workspace_quotas_member_read ON workspace_quotas
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM profiles WHERE id = auth.uid()
  ));

-- Aggregated monthly usage view (current calendar month in UTC).
CREATE OR REPLACE VIEW workspace_usage_current_month AS
SELECT
  w.id AS workspace_id,
  w.name AS workspace_name,
  COALESCE(SUM(CASE WHEN ue.kind IN ('llm_tokens_input','llm_tokens_output') THEN ue.quantity END), 0) AS llm_tokens,
  COALESCE(SUM(CASE WHEN ue.kind = 'email_sent' THEN ue.quantity END), 0) AS emails_sent,
  COALESCE(SUM(CASE WHEN ue.kind = 'sms_sent' THEN ue.quantity END), 0) AS sms_sent,
  COALESCE(SUM(CASE WHEN ue.kind = 'voice_minutes' THEN ue.quantity END), 0) AS voice_minutes,
  COALESCE(SUM(ue.cost_cents), 0) AS total_cost_cents,
  COUNT(ue.id) AS event_count
FROM workspaces w
LEFT JOIN usage_events ue
  ON ue.workspace_id = w.id
  AND ue.created_at >= date_trunc('month', now())
GROUP BY w.id, w.name;

GRANT SELECT ON workspace_usage_current_month TO service_role;
