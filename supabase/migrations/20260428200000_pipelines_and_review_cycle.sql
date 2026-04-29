-- Vertical pipelines — transaction stages on properties (realtor)
-- and review cycle stages on contacts (advisor).
--
-- Idempotent additive ALTERs only; no destructive changes. Existing
-- properties.status (active|pending|sold|withdrawn|off_market) and
-- existing contacts shape are untouched. The new columns expose
-- finer-grained pipeline stages that the work queue can scan for
-- stuck deals and overdue reviews.

-- ── Properties — transaction pipeline ──────────────────────────
--
-- Stages: listed → showing → offer → pending → closed
-- Plus terminal: withdrawn, expired
--
-- The stage is informational; properties.status remains the
-- canonical lifecycle field for compatibility with anything that
-- already filters on it.

alter table properties
  add column if not exists transaction_stage text
    check (
      transaction_stage is null
      or transaction_stage in (
        'listed', 'showing', 'offer', 'pending',
        'closed', 'withdrawn', 'expired'
      )
    );
alter table properties add column if not exists stage_entered_at timestamptz;
alter table properties add column if not exists expected_close_date date;

-- Hot path for the "stuck deal" work-queue scan: workspace + stage
-- + how long the deal's been in this stage.
create index if not exists properties_pipeline_idx
  on properties(workspace_id, transaction_stage, stage_entered_at)
  where transaction_stage is not null;

-- Auto-stamp stage_entered_at when transaction_stage changes. The
-- API route also stamps explicitly; the trigger is a backstop for
-- direct DB updates (admin tools, future automations).
create or replace function properties_stage_touch()
returns trigger language plpgsql as $$
begin
  if new.transaction_stage is distinct from old.transaction_stage then
    new.stage_entered_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists properties_stage_touch on properties;
create trigger properties_stage_touch
  before update on properties
  for each row execute function properties_stage_touch();

-- ── Contacts — review cycle ────────────────────────────────────
--
-- Stages: due → prep → meeting → recap_sent → done
-- Cadence in months drives the next_review_date roll-forward when
-- a review completes.

alter table contacts
  add column if not exists review_stage text
    check (
      review_stage is null
      or review_stage in (
        'due', 'prep', 'meeting', 'recap_sent', 'done'
      )
    );
alter table contacts add column if not exists next_review_date date;
alter table contacts
  add column if not exists review_cadence_months integer default 3
    check (review_cadence_months is null or review_cadence_months between 1 and 36);
alter table contacts add column if not exists last_review_completed_at timestamptz;

create index if not exists contacts_review_idx
  on contacts(workspace_id, review_stage, next_review_date)
  where review_stage is not null and review_stage <> 'done';
