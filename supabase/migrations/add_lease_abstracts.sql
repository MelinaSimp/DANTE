-- Lease abstracts: structured extraction results from commercial leases.
-- Each row is one abstraction pass over a vault_item.

CREATE TABLE IF NOT EXISTS lease_abstracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  vault_item_id uuid NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_analysis jsonb,
  error_message text,
  model text,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  extraction_seconds numeric(8,2),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_abstracts_workspace
  ON lease_abstracts (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lease_abstracts_vault_item
  ON lease_abstracts (vault_item_id);

ALTER TABLE lease_abstracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can view lease abstracts"
  ON lease_abstracts FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "workspace members can insert lease abstracts"
  ON lease_abstracts FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "workspace members can update lease abstracts"
  ON lease_abstracts FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM profiles WHERE id = auth.uid()
  ));
