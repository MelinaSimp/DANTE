-- Multiple SMS-verified phones per profile.
--
-- Up until now, profiles.sms_phone held a single text column. To support
-- a user texting Dante from multiple devices (personal cell + work cell +
-- iPad, etc.), we move the truth into a child table — one row per
-- verified phone — and keep profiles.sms_phone as a synced "primary"
-- pointer so existing outbound paths (briefing cron, proactive nudges)
-- don't have to know about the new table.
--
-- One row may be flagged is_primary; that's the number outbound goes to.
-- Inbound is matched against any verified phone on the table.

create table if not exists public.profile_sms_phones (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  phone text not null,
  label text,
  is_primary boolean not null default false,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- A given phone can only be tied to one profile at a time (verification
-- transfers ownership — handled in the verify/confirm endpoint).
create unique index if not exists profile_sms_phones_phone_unique
  on public.profile_sms_phones(phone);

create index if not exists profile_sms_phones_profile_idx
  on public.profile_sms_phones(profile_id);

-- At most one primary per profile.
create unique index if not exists profile_sms_phones_primary_unique
  on public.profile_sms_phones(profile_id) where is_primary;

-- Backfill from the legacy single-phone column. Each profile with a
-- verified sms_phone gets a row tagged primary. Skip duplicates (e.g.,
-- if a phone somehow appears on two profiles — the surviving row will
-- be the first inserted; the rest stay in their legacy columns).
insert into public.profile_sms_phones (profile_id, phone, is_primary, verified_at, created_at)
select id, sms_phone, true, coalesce(sms_verified_at, now()), created_at
from public.profiles
where sms_phone is not null and sms_verified_at is not null
on conflict (phone) do nothing;

-- RLS: users can read/write only their own rows. Service-role bypasses
-- as usual for webhook + admin paths.
alter table public.profile_sms_phones enable row level security;

drop policy if exists profile_sms_phones_self_all on public.profile_sms_phones;
create policy profile_sms_phones_self_all
  on public.profile_sms_phones
  for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

comment on table public.profile_sms_phones is
  'Per-profile list of verified phone numbers. Inbound SMS matches any row; outbound briefings go to the row with is_primary=true (also mirrored to profiles.sms_phone for backward compat).';
