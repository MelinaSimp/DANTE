-- ============================================
-- DRIFT AGENT BUILDER - COMPLETE STORAGE SETUP
-- ============================================
-- This creates the storage bucket with proper public access
-- ============================================

-- Create storage bucket for agent files (won't error if it exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-files',
  'agent-files',
  true, -- Public bucket (files readable by anyone with URL)
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'text/plain', 'application/json', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/jpg', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET public = true; -- Make sure it's public

-- Drop existing policies if they exist (to avoid errors)
DROP POLICY IF EXISTS "Users can upload files for their workspace agents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read files for their workspace agents" ON storage.objects;
DROP POLICY IF EXISTS "Public can read files from agent-files bucket" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete files for their workspace agents" ON storage.objects;

-- IMPORTANT: Allow PUBLIC (anonymous) reads for public bucket
-- This is required for the bucket to be truly public
CREATE POLICY "Public can read files from agent-files bucket"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'agent-files');

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

-- Allow authenticated users to read files (redundant but explicit)
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

SELECT 'Storage bucket setup completed successfully! Public read access enabled.' as status;

