-- Let customers create their own autonomous agents from the Autonomous tab.
-- Preset agents (Engagement Monitor, Revenue Analyzer, …) keep is_custom=false
-- and use the hardcoded data loaders + prompts. Custom agents store their own
-- natural-language instructions + a chosen set of CRM data sources.

alter table wm_agent_definitions
  add column if not exists is_custom boolean not null default false,
  add column if not exists custom_instructions text,
  add column if not exists data_sources text[] not null default array[]::text[],
  add column if not exists created_by uuid;

-- RLS — scope to workspace for all ops, but only custom agents are deletable
-- (so a customer can't nuke their preset Engagement Monitor by accident).
alter table wm_agent_definitions enable row level security;

drop policy if exists wm_agent_defs_select on wm_agent_definitions;
create policy wm_agent_defs_select on wm_agent_definitions
  for select using (
    workspace_id in (select workspace_id from profiles where id = auth.uid())
  );

drop policy if exists wm_agent_defs_insert on wm_agent_definitions;
create policy wm_agent_defs_insert on wm_agent_definitions
  for insert with check (
    workspace_id in (select workspace_id from profiles where id = auth.uid())
  );

drop policy if exists wm_agent_defs_update on wm_agent_definitions;
create policy wm_agent_defs_update on wm_agent_definitions
  for update using (
    workspace_id in (select workspace_id from profiles where id = auth.uid())
  );

drop policy if exists wm_agent_defs_delete on wm_agent_definitions;
create policy wm_agent_defs_delete on wm_agent_definitions
  for delete using (
    is_custom = true
    and workspace_id in (select workspace_id from profiles where id = auth.uid())
  );

drop policy if exists wm_agent_defs_service on wm_agent_definitions;
create policy wm_agent_defs_service on wm_agent_definitions
  for all using (auth.jwt() ->> 'role' = 'service_role');
