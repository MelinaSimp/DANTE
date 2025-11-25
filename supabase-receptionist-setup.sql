-- Receptionist configuration tables
create table if not exists receptionist_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  twilio_phone_number text unique,
  greeting text default 'Hello! Thanks for calling. I just need a few quick details.',
  farewell text default 'Thanks for calling. Someone from the team will reach out shortly.',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists receptionist_questions (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  prompt text not null,
  expected_response text default 'open',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists receptionist_questions_workspace_idx on receptionist_questions(workspace_id, sort_order);

create table if not exists receptionist_sessions (
  call_sid text primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  from_number text,
  to_number text,
  current_index int default 0,
  answers jsonb default '[]'::jsonb,
  followup_queue jsonb default '[]'::jsonb,
  followup_index int default 0,
  completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists receptionist_call_logs (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  call_sid text not null,
  from_number text,
  to_number text,
  answers jsonb,
  ai_response text,
  analysis text,
  created_at timestamptz default now()
);

create index if not exists receptionist_call_logs_workspace_idx on receptionist_call_logs(workspace_id, created_at desc);
