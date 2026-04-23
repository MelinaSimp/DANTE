-- Adds an optional `first_message` column to `agents`. When set, the
-- VAPI sync uses this verbatim as the assistant's opening line; when
-- null, it falls back to the existing behaviour (first scenario step,
-- then a generic greeting). Editable from the CRM's agent config page.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS first_message TEXT;
