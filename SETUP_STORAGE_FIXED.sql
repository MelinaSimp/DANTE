-- ============================================
-- DRIFT AGENT BUILDER - STORAGE BUCKET SETUP (FIXED)
-- ============================================
-- This creates the storage bucket for agent file uploads
-- Handles existing policies gracefully
-- ============================================

-- Create storage bucket for agent files (won't error if it exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-files',
  'agent-files',
  true, -- Public bucket (files readable by anyone with URL, but upload/delete still protected by policies)
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'text/plain', 'application/json', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/jpg', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET public = true; -- Make sure it's public

-- Drop existing policies if they exist (to avoid errors)
DROP POLICY IF EXISTS "Users can upload files for their workspace agents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read files for their workspace agents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete files for their workspace agents" ON storage.objects;

-- Storage policies for agent-files bucket
-- Allow authenticated users to upload files for their workspace agents
CREATE POLICY "Users can upload files for their workspace agents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'agent-files' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM agents WHERE workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  )
);

-- Allow authenticated users to read files for their workspace agents
CREATE POLICY "Users can read files for their workspace agents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'agent-files' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM agents WHERE workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  )
);

-- Allow authenticated users to delete files for their workspace agents
CREATE POLICY "Users can delete files for their workspace agents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'agent-files' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM agents WHERE workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  )
);

SELECT 'Storage bucket setup completed successfully!' as status;

