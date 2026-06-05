-- 20260605_lease_abstract_columns.sql
--
-- Adds denormalized columns to lease_abstracts that the cron tick's
-- trigger_lease_expiry needs for efficient querying. Previously
-- these lived only inside the `fields` JSONB array, making
-- date-range queries impossible without extracting at read time.
--
-- Also adds property_id FK so abstracts can link to CRM properties,
-- enabling the lease expiry notification workflow and property-level
-- reporting.

-- Denormalized columns extracted from JSONB fields after abstraction
ALTER TABLE lease_abstracts
  ADD COLUMN IF NOT EXISTS tenant_name text,
  ADD COLUMN IF NOT EXISTS expiration_date date,
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES properties(id) ON DELETE SET NULL;

-- Index for the lease expiry cron query:
-- SELECT ... WHERE workspace_id = ? AND expiration_date BETWEEN today AND horizon
CREATE INDEX IF NOT EXISTS idx_lease_abstracts_expiry
  ON lease_abstracts (workspace_id, expiration_date)
  WHERE expiration_date IS NOT NULL;

-- Index for property-based lookups
CREATE INDEX IF NOT EXISTS idx_lease_abstracts_property
  ON lease_abstracts (property_id)
  WHERE property_id IS NOT NULL;

-- Backfill: extract tenant_name and expiration_date from existing
-- completed abstracts. Uses the JSONB fields array.
UPDATE lease_abstracts
SET
  tenant_name = (
    SELECT f->>'value'
    FROM jsonb_array_elements(fields) AS f
    WHERE f->>'name' = 'Tenant Name'
      AND f->>'value' IS NOT NULL
      AND f->>'value' != ''
    LIMIT 1
  ),
  expiration_date = (
    SELECT (f->>'value')::date
    FROM jsonb_array_elements(fields) AS f
    WHERE f->>'name' = 'Expiration Date'
      AND f->>'value' IS NOT NULL
      AND f->>'value' != ''
      AND f->>'value' ~ '^\d{4}-\d{2}-\d{2}'
    LIMIT 1
  )
WHERE status = 'completed'
  AND tenant_name IS NULL;

COMMENT ON COLUMN lease_abstracts.tenant_name IS
  'Denormalized from fields JSONB; populated on extraction completion for display and search.';
COMMENT ON COLUMN lease_abstracts.expiration_date IS
  'Denormalized from fields JSONB; populated on extraction completion for the lease expiry cron trigger.';
COMMENT ON COLUMN lease_abstracts.property_id IS
  'Optional link to a CRM property. Set manually by the user or auto-matched by address.';
