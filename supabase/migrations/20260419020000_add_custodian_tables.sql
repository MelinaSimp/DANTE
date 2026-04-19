-- Custodian layer — the advisor-data moat.
--
-- Each advisor firm connects to one or more custodians (Schwab,
-- Fidelity, Altruist, ...). We store:
--
--   custodian_connections: one row per firm ↔ custodian link, with
--     credential refs (access keys live in Supabase Vault, not here).
--
--   custodian_accounts: one row per client account at the custodian.
--     Linked to a contact (our internal client) when identified.
--
--   custodian_positions: point-in-time snapshot of holdings. We don't
--     try to maintain a running ledger — we take a daily snapshot and
--     diff. Simpler, and matches how Schwab's Pull API works.
--
--   custodian_balances: summary row per account per snapshot —
--     total_value, cash, and qualified/taxable split. Fast path for
--     the dashboard without scanning positions.
--
-- This is scaffold shape only — the mock driver (lib/custodians/mock)
-- populates these tables from fixtures so the dashboard and compliance
-- scanner can reference real-looking data.

create table if not exists custodian_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- 'schwab' | 'fidelity' | 'altruist' | 'mock'
  provider text not null,
  -- Advisor's firm ID at the custodian (IAR code, advisor rep ID, etc).
  provider_firm_id text,
  -- Display name chosen by the advisor ("Drift @ Schwab Institutional")
  display_name text,
  -- Vault ref where the OAuth token lives. Never store raw credentials.
  credentials_vault_ref text,
  status text not null default 'pending', -- 'pending' | 'active' | 'error' | 'revoked'
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (workspace_id, provider, provider_firm_id)
);

create index if not exists idx_custodian_connections_workspace
  on custodian_connections (workspace_id);

create table if not exists custodian_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  connection_id uuid not null references custodian_connections(id) on delete cascade,
  -- The custodian's own account number (string — can include letters).
  provider_account_id text not null,
  -- 'ira' | 'roth_ira' | 'taxable' | '401k' | 'trust' | 'joint' | 'other'
  account_type text not null,
  account_name text,
  contact_id uuid references contacts(id) on delete set null,
  opened_at date,
  closed_at date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (connection_id, provider_account_id)
);

create index if not exists idx_custodian_accounts_workspace
  on custodian_accounts (workspace_id);
create index if not exists idx_custodian_accounts_contact
  on custodian_accounts (contact_id);

create table if not exists custodian_balances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references custodian_accounts(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  as_of date not null,
  total_value numeric(18, 2) not null,
  cash_value numeric(18, 2),
  securities_value numeric(18, 2),
  created_at timestamptz default now(),
  unique (account_id, as_of)
);

create index if not exists idx_custodian_balances_account_date
  on custodian_balances (account_id, as_of desc);

create table if not exists custodian_positions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references custodian_accounts(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  as_of date not null,
  symbol text not null,
  description text,
  quantity numeric(18, 6) not null,
  market_value numeric(18, 2) not null,
  cost_basis numeric(18, 2),
  unrealized_gain numeric(18, 2),
  created_at timestamptz default now()
);

create index if not exists idx_custodian_positions_account_date
  on custodian_positions (account_id, as_of desc);

alter table custodian_connections enable row level security;
alter table custodian_accounts enable row level security;
alter table custodian_balances enable row level security;
alter table custodian_positions enable row level security;

-- Workspace-scoped policies for all four tables.
create policy "Workspace members read custodian_connections"
  on custodian_connections for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members read custodian_accounts"
  on custodian_accounts for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members read custodian_balances"
  on custodian_balances for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members read custodian_positions"
  on custodian_positions for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

-- Writes go through the sync worker (service role); there are no
-- direct client-initiated writes to these tables.
