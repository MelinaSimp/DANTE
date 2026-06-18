-- Autonomous pipeline ("Hermes") output.
--
-- When a document is ingested, the orchestrator classifies it and runs
-- the matching analysis (e.g. auto-underwrite a rent roll). Each result
-- lands here as a pending review item — nothing is sent externally, so
-- this doubles as the approval gate. One analysis per vault item.

create table if not exists dante_document_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  vault_item_id uuid references vault_items(id) on delete cascade,
  doc_type text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  title text,
  headline text,
  confidence numeric,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vault_item_id)
);

create index if not exists dante_document_analyses_ws_created_idx
  on dante_document_analyses(workspace_id, created_at desc);
create index if not exists dante_document_analyses_ws_status_idx
  on dante_document_analyses(workspace_id, status, created_at desc);

alter table dante_document_analyses enable row level security;

drop policy if exists "doc_analyses read own workspace" on dante_document_analyses;
create policy "doc_analyses read own workspace"
  on dante_document_analyses for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

create or replace function dante_document_analyses_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dante_document_analyses_touch on dante_document_analyses;
create trigger dante_document_analyses_touch
  before update on dante_document_analyses
  for each row execute function dante_document_analyses_touch();
