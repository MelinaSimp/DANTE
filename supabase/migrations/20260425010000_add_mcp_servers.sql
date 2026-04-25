-- MCP servers — Phase 1 scaffolding for the third-party tool
-- ecosystem (Wealthbox, Redtail, Salesforce, etc.). Each row is one
-- HTTPS endpoint that speaks the Model Context Protocol over JSON-RPC,
-- registered to a workspace.
--
-- Phase 1 ships only the storage + the in-app client module. Phase 2
-- builds the actual Wealthbox MCP server (a small Next.js route)
-- and the connect-flow UI on top of this scaffolding. The Phase 1
-- promise is: a Phase 2 PR adding Wealthbox is < 200 lines of code,
-- because the agent loop already speaks `tools/list` and `tools/call`.
--
-- Auth shape lives in `auth jsonb` rather than a structured column
-- because connectors use wildly different auth (OAuth tokens, API
-- keys, signed bearer headers, mTLS metadata...) and we'd rather
-- keep the schema flat than carry a per-connector union type around.
-- Validation lives in lib/mcp/auth.ts.

create table if not exists mcp_servers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,

  -- Stable short name; used by the agent node's tools[] config to
  -- reference the server, e.g. tools: [{ mcp: "wealthbox" }].
  -- Unique-per-workspace because users connecting two Wealthbox
  -- accounts in the same workspace is not a real workflow we
  -- want to support yet.
  name text not null,

  -- HTTPS endpoint that accepts JSON-RPC 2.0 requests for MCP
  -- methods (tools/list, tools/call). For first-party connectors
  -- this is a route in this app; for third-party it's whatever
  -- the vendor publishes.
  url text not null,

  -- Free-form auth bag: { kind: 'oauth'|'apikey'|'bearer', ... }.
  -- Tokens are stored encrypted at rest by the application layer
  -- (lib/dante/secrets.ts) — never trust the raw row.
  auth jsonb not null default '{}'::jsonb,

  enabled boolean not null default true,

  -- Cached tool catalog from the most recent tools/list call. Lets
  -- the agent node's runtime expand `{ mcp: "wealthbox" }` into
  -- concrete OpenAI tool defs without a network round-trip per run.
  -- Refreshed on a 1h TTL or when the user clicks "Reconnect".
  tools_catalog jsonb not null default '[]'::jsonb,
  catalog_fetched_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, name)
);

create index if not exists mcp_servers_workspace_idx
  on mcp_servers(workspace_id)
  where enabled = true;

-- Touch updated_at on UPDATE so catalog refreshes get fresh stamps.
create or replace function mcp_servers_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mcp_servers_touch on mcp_servers;
create trigger mcp_servers_touch
  before update on mcp_servers
  for each row execute function mcp_servers_touch_updated_at();

-- RLS: same shape as dante_briefs / dante_memory. Authenticated
-- users read their own workspace; writes go through service-role
-- only (the connect/reconnect flow is a server action).
alter table mcp_servers enable row level security;

drop policy if exists "mcp_servers read own workspace" on mcp_servers;
create policy "mcp_servers read own workspace"
  on mcp_servers for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );
