-- Tags column on dante_workflows
alter table dante_workflows
  add column if not exists tags text[] not null default '{}';

-- Workflow versions (snapshot on every save)
create table if not exists dante_workflow_versions (
  id         uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references dante_workflows(id) on delete cascade,
  workspace_id uuid not null,
  version    int not null,
  name       text,
  description text,
  graph      jsonb not null,
  trigger    jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (workflow_id, version)
);

create index if not exists idx_wfv_workflow
  on dante_workflow_versions(workflow_id);

-- Secrets table (may already exist from earlier migration)
create table if not exists dante_secrets (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  key          text not null,
  value        text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, key)
);
