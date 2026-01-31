-- Client documents and annotations
-- One primary PDF per contact (client), with highlights, comments, and page-wise tags

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  extracted_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contact_id) -- One primary PDF per client
);

CREATE TABLE IF NOT EXISTS document_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('highlight', 'comment', 'tag')),
  content TEXT,
  bounding_box JSONB NOT NULL, -- {x, y, width, height} or {x1, y1, x2, y2} in normalized coords
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read documents in their workspace" ON documents
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert documents in their workspace" ON documents
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update documents in their workspace" ON documents
  FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can delete documents in their workspace" ON documents
  FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can read annotations for their documents" ON document_annotations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN profiles p ON d.workspace_id = p.workspace_id
      WHERE d.id = document_annotations.document_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert annotations for their documents" ON document_annotations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN profiles p ON d.workspace_id = p.workspace_id
      WHERE d.id = document_annotations.document_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "Users can update annotations for their documents" ON document_annotations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN profiles p ON d.workspace_id = p.workspace_id
      WHERE d.id = document_annotations.document_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "Users can delete annotations for their documents" ON document_annotations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN profiles p ON d.workspace_id = p.workspace_id
      WHERE d.id = document_annotations.document_id AND p.id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_documents_contact_id ON documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_document_annotations_document_id ON document_annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_document_annotations_page ON document_annotations(document_id, page_number);

-- Trigger for documents updated_at (function may exist from other migrations)
DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
