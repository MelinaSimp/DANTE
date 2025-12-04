-- Add Q/A fields to steps table
ALTER TABLE steps 
ADD COLUMN IF NOT EXISTS qa_query TEXT,
ADD COLUMN IF NOT EXISTS qa_data_source_ids UUID[],
ADD COLUMN IF NOT EXISTS qa_fallback_message TEXT;

-- Update type constraint to include 'qa'
-- Note: If you have a CHECK constraint on type, you'll need to drop and recreate it
-- For now, we'll just add the column and let the application handle validation




