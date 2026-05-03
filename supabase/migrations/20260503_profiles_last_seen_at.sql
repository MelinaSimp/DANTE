-- 20260503_profiles_last_seen_at.sql
--
-- Per-user "last seen" timestamp powering the "Since you were last
-- here" panel on the dashboard (B1 from the panel-review roadmap —
-- the killer feature: a 7am digest of every material change to the
-- advisor's book since their last login). Updated on every
-- authenticated dashboard load. NULL on first visit so the panel
-- can render an "everything is new" framing instead of a since-time
-- stamp.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN profiles.last_seen_at IS
  'Timestamp of the last authenticated dashboard load. Drives the since-last-login digest. NULL for first-time visitors.';
