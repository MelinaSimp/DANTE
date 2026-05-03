-- 20260503_stripe_processed_events.sql
--
-- Stripe webhook idempotency.
--
-- Both webhook handlers (/api/stripe/webhook and /api/billing/webhook)
-- verify the request came from Stripe via stripe.webhooks.
-- constructEvent(). That proves authenticity but NOT freshness — a
-- captured signed payload can be replayed indefinitely until the
-- signing secret rotates. Replay of customer.subscription.deleted
-- repeatedly canceling a workspace, or invoice.payment_failed
-- repeatedly tripping past_due, are real-shape attacks.
--
-- This table is the idempotency ledger: each Stripe event id is
-- inserted exactly once. The webhook handlers attempt the insert
-- before processing; on conflict (event already seen), they short-
-- circuit and return 200 OK so Stripe stops retrying.
--
-- No PII here — just the event id, type, and processed_at. We keep
-- 90 days of history; older rows are eligible for cleanup by the
-- retention worker (one-line addition; cleanup is non-urgent because
-- volume is small).

CREATE TABLE IF NOT EXISTS stripe_processed_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_processed_events_processed_at_idx
  ON stripe_processed_events (processed_at);

COMMENT ON TABLE stripe_processed_events IS
  'Idempotency ledger for Stripe webhook events. INSERT ON CONFLICT DO NOTHING; if no row was inserted the event is a replay and must be ignored. Closes the captured-signed-payload replay vector.';
