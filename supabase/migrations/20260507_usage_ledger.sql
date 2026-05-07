-- dante_usage_ledger + per-workspace pricing/allowance fields.
--
-- Every LLM call goes through lib/dante/model-router.ts → meterAndCall(),
-- which writes one row here. The dashboard, the usage banner, and the
-- admin surface all read from this table.
--
-- Append-only by convention; we never UPDATE rows. Aggregations are
-- cheap because the index covers (workspace_id, created_at) which is
-- the dashboard's exact query shape.

create table if not exists public.dante_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,

  -- Which model billed for this call. Stored as a free-text id so we
  -- aren't locked to a check constraint when Anthropic ships new
  -- variants. Examples: 'claude-haiku-4-5', 'claude-sonnet-4-6',
  -- 'claude-opus-4-7'.
  model text not null,

  -- Token breakdown. cached_input_tokens is the slice of input that
  -- hit the prompt cache (90% discount); we store separately so the
  -- $ math is auditable per row.
  input_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  output_tokens integer not null default 0,

  -- Total cost in cents (1/100 USD). Pre-computed at write time using
  -- the rates known at that moment, so historical rows stay accurate
  -- even after Anthropic price changes.
  cost_cents integer not null default 0,

  -- Optional context for debugging / per-feature analytics. The most
  -- common values: 'chat', 'memory.search', 'vault.cite',
  -- 'inconsistency.detect', 'rmd.calculate', 'deep_research',
  -- 'web_scraper', 'noticed_compute'.
  feature text,

  created_at timestamptz not null default now()
);

-- Dashboard query: WHERE workspace_id = ? AND created_at >= start_of_month.
-- The (workspace_id, created_at desc) index covers it directly.
create index if not exists dante_usage_ledger_workspace_time_idx
  on public.dante_usage_ledger (workspace_id, created_at desc);

-- Cross-workspace ops query (admin/usage/global): top-N by spend in
-- a date window. Index on (created_at desc) so the planner can scan
-- the recent slice and aggregate up.
create index if not exists dante_usage_ledger_time_idx
  on public.dante_usage_ledger (created_at desc);

alter table public.dante_usage_ledger enable row level security;

-- Customers (workspace members) can read their own workspace's usage —
-- needed for the banner + /settings/usage page. No write path; only
-- the service role inserts.
drop policy if exists dante_usage_ledger_select on public.dante_usage_ledger;
create policy dante_usage_ledger_select on public.dante_usage_ledger
  for select using (
    workspace_id in (
      select workspace_id from public.profiles where id = auth.uid()
    )
  );

comment on table public.dante_usage_ledger is
  'Append-only ledger of every LLM call. Powers the usage banner, admin overage tracking, and Stripe metered-billing reconciliation.';

-- ── Workspace pricing/allowance fields ────────────────────────────
--
-- Per-customer pricing — every workspace gets its own contracted
-- monthly price + included AI usage allowance + overage markup. Set
-- by Drift admin per customer; new workspaces get sensible defaults.

alter table public.workspaces
  add column if not exists monthly_price_cents integer not null default 14900,
  add column if not exists usage_allowance_cents integer not null default 3000,
  add column if not exists overage_markup_pct integer not null default 30,
  -- Per-workspace model routing override. Shape:
  --   { "routing": "claude-haiku-4-5", "bulk": "claude-sonnet-4-6", "hard": "claude-opus-4-7" }
  -- Null fields fall back to the system default in pickModel().
  add column if not exists model_overrides jsonb not null default '{}'::jsonb;

comment on column public.workspaces.monthly_price_cents is
  'What this customer pays Drift per month. Set per-customer via /admin/customers.';
comment on column public.workspaces.usage_allowance_cents is
  'Included AI usage budget (cents) per month before overage billing kicks in.';
comment on column public.workspaces.overage_markup_pct is
  'Markup applied to AI cost above allowance, integer percent (30 = 1.30×).';
comment on column public.workspaces.model_overrides is
  'Per-workspace model selection override. Keys: routing, bulk, hard.';

-- ── Threshold notification dedupe ─────────────────────────────────
--
-- Tracks which usage thresholds have already triggered an ops
-- notification this month, so 150%/200% emails don't double-fire.
-- One row per (workspace, year-month, threshold). Cleaned up monthly.

create table if not exists public.dante_usage_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  year_month text not null,           -- e.g. '2026-05'
  threshold_pct integer not null,     -- 100, 125, 150, 200
  notified_at timestamptz not null default now(),
  unique (workspace_id, year_month, threshold_pct)
);

alter table public.dante_usage_notifications enable row level security;
-- No customer-facing read path; this is ops infra. Service role only.
