-- Properties expansion + property_documents link table.
--
-- Two motivations:
--
--   1. Realtor workspaces need richer property metadata than the
--      original schema captured — descriptions, interior/exterior
--      features, year/lot, and a full lease block for rentals.
--
--   2. Vergil (and Dante, where it applies) needs to surface
--      AI-generated reminders for document renewals: leases,
--      insurance, disclosures, inspections. That requires a place
--      to attach documents to a property with an expires_at the
--      reminder cron can scan.
--
-- Both pieces use additive, idempotent DDL so this can be replayed
-- safely. The reminders cron extension that consumes property_documents
-- ships in the same change set; see app/api/reminders/cron/tick/route.ts.
--
-- The properties table itself was created out-of-band (no prior
-- migration in this folder), so we use `add column if not exists`
-- and `alter ... type` defensively.

-- 1. Properties — new descriptive fields.
alter table properties add column if not exists description text;
alter table properties add column if not exists interior_features text[] not null default '{}'::text[];
alter table properties add column if not exists exterior_features text[] not null default '{}'::text[];
alter table properties add column if not exists year_built integer;
alter table properties add column if not exists lot_size_sqft integer;

-- 2. Properties — lease block (only meaningful when kind='rental',
-- but storing flat keeps the schema simple).
alter table properties add column if not exists lease_term_months integer;
alter table properties add column if not exists lease_start_date date;
alter table properties add column if not exists lease_end_date date;
alter table properties add column if not exists monthly_rent_cents bigint;
alter table properties add column if not exists tenant_contact_id uuid references contacts(id) on delete set null;

-- 3. property_documents — files / links attached to a property.
-- workspace_id is denormalised onto the row so RLS policies don't
-- need to join through properties.
create table if not exists property_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,

  title text not null,                                   -- "2026 Lease — Smith", "Roof inspection (2024)"
  doc_kind text not null default 'other'                 -- lease | inspection | disclosure | comp | photo | deed | hoa | insurance | other
    check (doc_kind in (
      'lease', 'inspection', 'disclosure', 'comp',
      'photo', 'deed', 'hoa', 'insurance', 'other'
    )),

  -- Either a Supabase Storage path (uploaded file) OR an external
  -- URL (link to iManage, Google Drive, MLS, etc.). At least one
  -- should be set in practice, but we don't enforce it at the DB
  -- level so a placeholder row can exist before the file lands.
  file_path text,
  external_url text,

  -- Drives the renewal-reminder scan. Null = no expiry tracked
  -- (e.g. photos, deeds), non-null = scan picks it up when it falls
  -- inside the configured horizon.
  expires_at date,

  notes text,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_documents_property_idx
  on property_documents(property_id);

-- Hot path for the renewal-reminder cron: workspace + non-null
-- expires_at, ordered chronologically.
create index if not exists property_documents_expiry_idx
  on property_documents(workspace_id, expires_at)
  where expires_at is not null;

create or replace function property_documents_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists property_documents_touch on property_documents;
create trigger property_documents_touch
  before update on property_documents
  for each row execute function property_documents_touch_updated_at();

-- 4. Reminders — idempotency key for the document-expiry scan pass.
-- The cron at /api/reminders/cron/tick uses (property_document_id,
-- source='auto') to avoid double-proposing a renewal reminder for
-- the same document.
alter table reminders add column if not exists property_document_id uuid
  references property_documents(id) on delete cascade;
create index if not exists reminders_property_document_idx
  on reminders(property_document_id)
  where property_document_id is not null;

-- 5. RLS — same pattern as the rest of the workspace-scoped tables.
alter table property_documents enable row level security;

drop policy if exists "property_documents read own workspace" on property_documents;
create policy "property_documents read own workspace"
  on property_documents for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

drop policy if exists "property_documents write own workspace" on property_documents;
create policy "property_documents write own workspace"
  on property_documents for insert
  to authenticated
  with check (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

drop policy if exists "property_documents update own workspace" on property_documents;
create policy "property_documents update own workspace"
  on property_documents for update
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

drop policy if exists "property_documents delete own workspace" on property_documents;
create policy "property_documents delete own workspace"
  on property_documents for delete
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );
