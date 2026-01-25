-- Add image instructions and PDF annotations to llm_guidelines table
-- Allows users to provide instructions about image handling and annotate PDFs

ALTER TABLE llm_guidelines 
ADD COLUMN IF NOT EXISTS image_instructions TEXT,
ADD COLUMN IF NOT EXISTS pdf_annotations JSONB DEFAULT '[]'::jsonb;

-- pdf_annotations structure:
-- [
--   {
--     "page": 1,
--     "section": "Introduction",
--     "annotation": "This section explains the core concept",
--     "highlight": "Key points to emphasize"
--   }
-- ]

COMMENT ON COLUMN llm_guidelines.image_instructions IS 'Instructions for the AI about where to keep pictures and how to write when images are involved';
COMMENT ON COLUMN llm_guidelines.pdf_annotations IS 'Annotations and notes about the PDF template to help the AI learn from it';
