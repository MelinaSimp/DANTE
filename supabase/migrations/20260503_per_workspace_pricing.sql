-- 20260503_per_workspace_pricing.sql
--
-- Drift bills enterprise-style: each workspace gets a negotiated
-- price, not a fixed tier price. The plan_tier column (starter /
-- pro / enterprise) stays — it drives feature gates. The dollar
-- amount lives on the workspace row, decoupled from the tier.
--
-- Schema additions:
--   stripe_price_id        — the Stripe Price object the
--                            workspace's checkout uses. Created in
--                            Stripe Dashboard or via the API by
--                            the superadmin during the negotiation.
--   stripe_subscription_id — set by the webhook when the workspace
--                            successfully subscribes. Used for
--                            cancellation flows.
--   stripe_customer_id     — set by the webhook on first checkout.
--                            Reused on renewals and subsequent
--                            seat changes.
--   custom_price_cents     — display-only field. The Stripe price
--                            is the source of truth; this column
--                            is what the billing UI shows the
--                            customer (and what audit logs record).
--   custom_plan_label      — display-only label, e.g. "Acme Wealth
--                            Enterprise — 12 seats" or "Founder's
--                            pricing". Surfaced in the billing UI.
--
-- A workspace WITHOUT stripe_price_id can still use Drift on the
-- free tier (plan_tier = 'starter' default). Checkout returns
-- "no_price_assigned" and shows the customer "Contact sales for
-- pricing" instead of a self-serve upgrade button.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS custom_price_cents int,
  ADD COLUMN IF NOT EXISTS custom_plan_label text;

-- stripe_customer_id may already exist from earlier billing
-- migrations; guard the add.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspaces'
      AND column_name = 'stripe_customer_id'
  ) THEN
    EXECUTE 'ALTER TABLE workspaces ADD COLUMN stripe_customer_id text';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspaces_stripe_price
  ON workspaces (stripe_price_id) WHERE stripe_price_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspaces_stripe_customer
  ON workspaces (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN workspaces.stripe_price_id IS
  'Per-workspace Stripe Price ID. Negotiated; assigned by superadmin. Drift does not use fixed tier prices.';
COMMENT ON COLUMN workspaces.custom_price_cents IS
  'Display-only monthly amount in cents. Stripe price is source of truth.';
COMMENT ON COLUMN workspaces.custom_plan_label IS
  'Free-form label for the assigned plan, shown in billing UI.';
