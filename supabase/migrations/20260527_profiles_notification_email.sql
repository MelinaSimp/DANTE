-- 20260527_profiles_notification_email.sql
--
-- Default email for notifications (appointment reminders, etc.)
-- When a contact has no email on file, the system falls back to this.
-- Already applied to production on 2026-05-27.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_email text;
