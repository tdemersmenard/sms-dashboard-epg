-- Create public storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read documents (public bucket)
CREATE POLICY "Public read documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents');

-- Allow service_role / authenticated to upload
CREATE POLICY "Authenticated upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents');

-- Allow service_role / authenticated to delete
CREATE POLICY "Authenticated delete documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents');
