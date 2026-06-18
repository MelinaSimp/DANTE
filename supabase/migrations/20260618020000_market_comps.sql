-- Market comparables imported from a user's own licensed export.
--
-- Compliant data sourcing: the user uploads a CoStar / county / CSV
-- export they are licensed to use; Drift parses it locally into
-- structured comps. Nothing is scraped or redistributed. One row per
-- comparable sale/listing.

create table if not exists market_comps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  source text,
  address text,
  city text,
  state text,
  property_type text,
  sf numeric,
  sale_price numeric,
  price_per_sf numeric,
  cap_rate numeric,
  sale_date date,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists market_comps_ws_created_idx
  on market_comps(workspace_id, created_at desc);

alter table market_comps enable row level security;

drop policy if exists "market_comps read own workspace" on market_comps;
create policy "market_comps read own workspace"
  on market_comps for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );
