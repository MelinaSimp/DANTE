-- TCPA compliance: do-not-call flag on contacts.
-- When set, outbound voice calls are blocked for this contact.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS do_not_call boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnc_reason text,
  ADD COLUMN IF NOT EXISTS dnc_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS dnc_set_by uuid;

CREATE INDEX IF NOT EXISTS idx_contacts_dnc
  ON contacts (workspace_id, do_not_call)
  WHERE do_not_call = true;
