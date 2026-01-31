-- Storage bucket for client documents (PDFs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-documents',
  'client-documents',
  false,
  10485760, -- 10MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Users can upload PDFs for contacts in their workspace
CREATE POLICY "Users can upload client documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'client-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT workspace_id::text FROM profiles WHERE id = auth.uid()
  )
);

-- Users can read documents for contacts in their workspace
CREATE POLICY "Users can read client documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'client-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT workspace_id::text FROM profiles WHERE id = auth.uid()
  )
);

-- Users can delete documents for contacts in their workspace
CREATE POLICY "Users can delete client documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'client-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT workspace_id::text FROM profiles WHERE id = auth.uid()
  )
);
