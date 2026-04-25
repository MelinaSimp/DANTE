-- Dante chats — the Harvey-style "Ask Dante anything" front door.
--
-- Two tables:
--   dante_chats          — one row per conversation, owner-scoped.
--   dante_chat_messages  — turn-by-turn message history. The
--                          assistant rows carry the agent's tool-call
--                          trace in `trace` so the UI can render the
--                          reasoning steps inline.
--
-- Why per-user rather than per-workspace: chats are personal — you
-- ask Dante things you don't necessarily want a coworker to read
-- ("draft an email apologizing to Sarah's husband"). RLS scopes
-- to user_id at the chat level, and chat_messages inherit via the
-- chat foreign key.
--
-- A chat is bound to a workspace too because the agent loop fires
-- inside one workspace's memory/archive — this is also what scopes
-- which contacts the model can see via clients.query.

create table if not exists dante_chats (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,

  -- Auto-derived from the first user message (first 60 chars). The
  -- caller can override after seeing the response if they want a
  -- better summary.
  title text not null default 'New chat',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dante_chats_recent_idx
  on dante_chats(workspace_id, user_id, updated_at desc);

create or replace function dante_chats_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists dante_chats_touch on dante_chats;
create trigger dante_chats_touch
  before update on dante_chats
  for each row execute function dante_chats_touch_updated_at();

alter table dante_chats enable row level security;

drop policy if exists "dante_chats read own" on dante_chats;
create policy "dante_chats read own"
  on dante_chats for select to authenticated
  using (user_id = auth.uid());

create table if not exists dante_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references dante_chats(id) on delete cascade,

  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,

  -- Assistant messages: full StepLogEntry[] trace from the agent
  -- loop, so the UI can render every tool call with input/output.
  -- User messages: empty array.
  trace jsonb not null default '[]'::jsonb,

  -- Token + model accounting. Useful for debugging skill cost and
  -- spotting runaway loops in the wild.
  model text,
  input_tokens integer default 0,
  output_tokens integer default 0,

  created_at timestamptz not null default now()
);

create index if not exists dante_chat_messages_chat_idx
  on dante_chat_messages(chat_id, created_at);

alter table dante_chat_messages enable row level security;

-- Messages inherit ownership from their parent chat.
drop policy if exists "dante_chat_messages read own" on dante_chat_messages;
create policy "dante_chat_messages read own"
  on dante_chat_messages for select to authenticated
  using (
    chat_id in (select id from dante_chats where user_id = auth.uid())
  );
