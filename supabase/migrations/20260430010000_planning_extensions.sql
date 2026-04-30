-- Phase-2 follow-ups: gaps closed in the same sprint.
--
--   1. is_planning_subject — exclude household admins, kids, etc.
--      from the analyzer pass without deleting them as contacts.
--   2. state_code — tells the Roth analyzer which state's top
--      bracket to layer onto federal cost.
--   3. residence_state on workspaces (DEFAULT for unknown contacts).
--
-- All additive; existing rows keep working.

alter table contacts add column if not exists is_planning_subject boolean default true;
alter table contacts add column if not exists state_code text;

-- Workspace-level fallback. Set in /admin/workspaces; used when a
-- contact's state_code is null.
alter table workspaces add column if not exists default_state_code text;
