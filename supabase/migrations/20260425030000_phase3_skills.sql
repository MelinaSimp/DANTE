-- Phase 3 — Dante skills registry.
--
-- A "skill" is a named, reusable capability the agent loop can call
-- as if it were a single tool, but which under the hood expands into
-- a small inline agent run with a fixed tool set, system prompt, and
-- input schema. Think of them as macros for common advisor patterns:
--
--   "draft_review_meeting_recap"
--     → input: { contact_id, meeting_notes }
--     → tools: [memory.search, archive.search, memory.write]
--     → output: markdown email body grounded in vault citations
--
-- Why a separate registry instead of just hardcoding more tools:
--   - Skills are workspace-customizable. Compliance teams want to
--     review and lock the prompts that draft client-facing copy.
--   - Skills compose. The "weekly_book_review" skill calls the
--     "draft_review_meeting_recap" skill across a list of contacts.
--   - Versioning. Edits create a new row; the old version stays so
--     audit trails point to the exact prompt that produced output.
--
-- Phase 3 also enables Harvey-style authoring on top of this — the
-- editor reads/writes skill rows so an advisor can build a workflow
-- from named skills without touching JSON.

create table if not exists dante_skills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,

  -- Stable short name. Unique per workspace + version so editing a
  -- skill creates a new (name, version) pair rather than mutating.
  name text not null,
  version integer not null default 1,

  description text not null,                             -- one-liner the agent sees

  -- The agent-step config the runner expands into when this skill
  -- is invoked. Validated against AgentStep['config'] at write time.
  config jsonb not null,

  -- Input/output schemas. The skill runner validates calls against
  -- input_schema before running and against output_schema after.
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb,

  -- True for skills that are safe to run without human review on the
  -- final output (memos, internal notes). False for client-facing
  -- copy (emails, meeting follow-ups) — those require approval before
  -- mutating tools fire. Compliance lever.
  auto_approve boolean not null default false,

  enabled boolean not null default true,

  created_by uuid,                                       -- profile id; nullable for seeded
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, name, version)
);

-- Latest-version lookup is the hot path; partial index keeps it tight.
create index if not exists dante_skills_lookup_idx
  on dante_skills(workspace_id, name, version desc)
  where enabled = true;

create or replace function dante_skills_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dante_skills_touch on dante_skills;
create trigger dante_skills_touch
  before update on dante_skills
  for each row execute function dante_skills_touch_updated_at();

alter table dante_skills enable row level security;

drop policy if exists "dante_skills read own workspace" on dante_skills;
create policy "dante_skills read own workspace"
  on dante_skills for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );
