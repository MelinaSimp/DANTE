-- Document templates: reusable section structures for Dante's
-- document.create tool. Brokers save a document they like as a
-- template, then Dante pre-fills section headings on future docs.
--
-- RLS: workspace members can read; owners/admins can insert/update/delete.

create table if not exists document_templates (
  id          uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name        text not null,
  description text,
  sections    jsonb not null default '[]'::jsonb,
  format      text not null default 'pdf' check (format in ('pdf', 'docx')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_document_templates_workspace on document_templates(workspace_id);

alter table document_templates enable row level security;

-- All workspace members can read templates
create policy "workspace members can read templates"
  on document_templates for select
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

-- Only owners/admins can create/update/delete templates
create policy "admins can manage templates"
  on document_templates for all
  using (
    workspace_id in (
      select workspace_id from profiles
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );
