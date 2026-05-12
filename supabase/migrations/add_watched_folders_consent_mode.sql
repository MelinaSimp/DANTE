-- Phase 3.1: Folder-level consent mode for watched folder scaling.
-- Two modes:
--   per_file (default) — current behavior, each file requires explicit confirmation
--   folder_consent     — all files auto-indexed after one-time folder consent
-- Consent is recorded with timestamp + user for audit trail.

ALTER TABLE watched_folders
  ADD COLUMN IF NOT EXISTS confirm_mode text NOT NULL DEFAULT 'per_file'
    CHECK (confirm_mode IN ('per_file', 'folder_consent')),
  ADD COLUMN IF NOT EXISTS consent_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_granted_by uuid REFERENCES auth.users(id);
