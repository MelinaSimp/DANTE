-- Trial workspace support.
-- Adds trial_ends_at to workspaces so self-service signups get a
-- 14-day trial without needing an admin to create the workspace.

alter table workspaces
  add column if not exists trial_ends_at timestamptz;

-- Index for expired-trial cleanup queries
create index if not exists idx_workspaces_trial_ends_at
  on workspaces (trial_ends_at)
  where trial_ends_at is not null;

comment on column workspaces.trial_ends_at is
  'When the trial expires. NULL = not a trial workspace (paid or pre-existing). Checked by billing gate.';
