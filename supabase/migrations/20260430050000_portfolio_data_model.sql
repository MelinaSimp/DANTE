-- Phase 5 — portfolio data model.
--
-- The custodian / aggregator adapters write into these tables. The
-- Holdings section on /client-details-overview, the planning agents
-- (Roth, RMD, TLH), and the future TLH-with-current-prices analyzer
-- read from them.
--
-- All tables are workspace-scoped with RLS. Each row carries a
-- source_connection_id pointing back at integration_connections so
-- (a) we know which custodian fed the row and (b) we can clean up
-- on disconnect.
--
-- Structure mirrors industry-standard custodian feeds:
--
--   security_master       — one row per security (ticker / CUSIP / SEDOL)
--   portfolio_accounts    — one row per custodial account
--   portfolio_positions   — one row per (account, security) snapshot
--                           on a given as_of_date
--   portfolio_transactions — every buy/sell/dividend/fee, point-in-time
--   portfolio_balances    — per-account daily total / cash / market value
--
-- The raw rows are detail-rich; the existing `accounts` view in
-- HoldingsSection rolls them up. When a custodian connection lands,
-- HoldingsSection picks up the data automatically because the
-- /api/contacts/[id]/holdings endpoint will UNION custodian-fed
-- accounts with the existing extraction-based accounts.

-- ── Security master ──────────────────────────────────────────
create table if not exists security_master (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- Identifiers
  cusip text,                         -- 9-char CUSIP
  isin text,                          -- 12-char ISIN
  sedol text,
  ticker text,                        -- e.g. 'VOO'
  symbol_id text,                     -- provider-side id (Schwab security id, Morningstar SecId, etc.)
  source_connection_id uuid references integration_connections(id) on delete set null,
  source text,                        -- 'schwab' | 'morningstar' | 'manual'
  -- Descriptive
  name text,                          -- 'Vanguard S&P 500 ETF'
  asset_class text,                   -- 'us_large_cap_blend' | 'core_bond' | etc.
  security_type text,                 -- 'equity' | 'etf' | 'mutual_fund' | 'bond' | 'option' | 'cash' | 'other'
  exchange text,                      -- 'NYSE' | 'NASDAQ'
  currency text default 'USD',
  -- Fund-specific
  expense_ratio numeric,              -- decimal, e.g. 0.0003 for 3 bps
  morningstar_rating integer,         -- 1-5 stars
  morningstar_category text,
  -- Pricing
  last_price numeric,
  last_price_at timestamptz,
  -- Metadata
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_security_master_workspace
  on security_master (workspace_id);
create index if not exists idx_security_master_cusip
  on security_master (workspace_id, cusip)
  where cusip is not null;
create index if not exists idx_security_master_ticker
  on security_master (workspace_id, ticker)
  where ticker is not null;
create unique index if not exists uq_security_master_cusip
  on security_master (workspace_id, cusip)
  where cusip is not null;
create unique index if not exists uq_security_master_ticker_source
  on security_master (workspace_id, ticker, source)
  where ticker is not null;

alter table security_master enable row level security;

create policy "Workspace members read security_master"
  on security_master for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members write security_master"
  on security_master for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members update security_master"
  on security_master for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

-- ── Portfolio accounts ───────────────────────────────────────
create table if not exists portfolio_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  source_connection_id uuid not null references integration_connections(id) on delete cascade,
  source text not null,                  -- 'schwab' | 'fidelity' | 'pershing' | 'altruist' | 'orion' | 'tamarac' | ...
  -- External identifiers
  external_account_id text not null,     -- custodian-side id; opaque
  account_number_masked text,            -- last 4
  -- Descriptive
  display_name text,                     -- e.g. "Henderson IRA - Schwab"
  account_type text,                     -- 'traditional_ira' | 'roth_ira' | 'taxable' | '401k' | 'trust' | etc.
  registration text,                     -- 'individual' | 'joint' | 'trust' | 'corporate' | ...
  is_discretionary boolean default true,
  -- Status
  is_active boolean default true,
  closed_at timestamptz,
  -- Metadata
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_connection_id, external_account_id)
);

create index if not exists idx_portfolio_accounts_workspace
  on portfolio_accounts (workspace_id);
create index if not exists idx_portfolio_accounts_contact
  on portfolio_accounts (contact_id);

alter table portfolio_accounts enable row level security;

create policy "Workspace members read portfolio_accounts"
  on portfolio_accounts for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members write portfolio_accounts"
  on portfolio_accounts for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members update portfolio_accounts"
  on portfolio_accounts for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

-- ── Portfolio positions ──────────────────────────────────────
create table if not exists portfolio_positions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  account_id uuid not null references portfolio_accounts(id) on delete cascade,
  security_id uuid references security_master(id) on delete set null,
  source_connection_id uuid not null references integration_connections(id) on delete cascade,
  -- Snapshot date
  as_of_date date not null,
  -- Position
  quantity numeric not null default 0,
  cost_basis numeric,                    -- aggregate; may differ from sum(tax_lots)
  market_value numeric,
  unrealized_gain_loss numeric,
  -- Tax lot detail aggregates (when reported)
  short_term_gain_loss numeric,
  long_term_gain_loss numeric,
  -- Metadata
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, security_id, as_of_date)
);

create index if not exists idx_portfolio_positions_workspace
  on portfolio_positions (workspace_id, as_of_date desc);
create index if not exists idx_portfolio_positions_account
  on portfolio_positions (account_id, as_of_date desc);

alter table portfolio_positions enable row level security;

create policy "Workspace members read portfolio_positions"
  on portfolio_positions for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members write portfolio_positions"
  on portfolio_positions for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members update portfolio_positions"
  on portfolio_positions for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

-- ── Portfolio transactions ───────────────────────────────────
create table if not exists portfolio_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  account_id uuid not null references portfolio_accounts(id) on delete cascade,
  security_id uuid references security_master(id) on delete set null,
  source_connection_id uuid not null references integration_connections(id) on delete cascade,
  external_transaction_id text,
  -- When
  trade_date date not null,
  settle_date date,
  -- What
  transaction_type text not null,        -- 'buy' | 'sell' | 'dividend' | 'interest' | 'fee' | 'transfer_in' | 'transfer_out' | 'reinvest' | 'tax_withholding' | 'other'
  description text,
  -- Amounts
  quantity numeric,
  price numeric,
  amount numeric,                        -- net cash impact
  fees numeric,
  -- Tax-lot detail
  cost_basis numeric,
  realized_gain_loss numeric,
  short_or_long text,                    -- 'short' | 'long' | null
  -- Metadata
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_connection_id, external_transaction_id)
);

create index if not exists idx_portfolio_transactions_workspace
  on portfolio_transactions (workspace_id, trade_date desc);
create index if not exists idx_portfolio_transactions_account
  on portfolio_transactions (account_id, trade_date desc);
create index if not exists idx_portfolio_transactions_type
  on portfolio_transactions (workspace_id, transaction_type, trade_date desc);

alter table portfolio_transactions enable row level security;

create policy "Workspace members read portfolio_transactions"
  on portfolio_transactions for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members write portfolio_transactions"
  on portfolio_transactions for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members update portfolio_transactions"
  on portfolio_transactions for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

-- ── Portfolio balances (daily) ───────────────────────────────
create table if not exists portfolio_balances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  account_id uuid not null references portfolio_accounts(id) on delete cascade,
  source_connection_id uuid not null references integration_connections(id) on delete cascade,
  as_of_date date not null,
  total_value numeric not null default 0,
  cash_value numeric default 0,
  market_value numeric default 0,
  pending_activity numeric default 0,
  buying_power numeric,
  margin_balance numeric,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, as_of_date)
);

create index if not exists idx_portfolio_balances_workspace
  on portfolio_balances (workspace_id, as_of_date desc);
create index if not exists idx_portfolio_balances_account
  on portfolio_balances (account_id, as_of_date desc);

alter table portfolio_balances enable row level security;

create policy "Workspace members read portfolio_balances"
  on portfolio_balances for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members write portfolio_balances"
  on portfolio_balances for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members update portfolio_balances"
  on portfolio_balances for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
