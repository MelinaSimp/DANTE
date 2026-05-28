-- Workspace market files — uploaded PDFs, docs, spreadsheets that
-- contain local market intelligence. Text is extracted server-side
-- and injected into Dante's system prompt during CRE analysis.

CREATE TABLE IF NOT EXISTS workspace_market_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename text NOT NULL,
  storage_path text NOT NULL,
  extracted_text text,
  file_size_bytes int,
  mime_type text,
  label text,  -- optional user-provided label ("Q1 2025 Market Report")
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_files_workspace
  ON workspace_market_files(workspace_id);

ALTER TABLE workspace_market_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_files_select ON workspace_market_files;
CREATE POLICY market_files_select ON workspace_market_files
  FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS market_files_insert ON workspace_market_files;
CREATE POLICY market_files_insert ON workspace_market_files
  FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS market_files_delete ON workspace_market_files;
CREATE POLICY market_files_delete ON workspace_market_files
  FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));
