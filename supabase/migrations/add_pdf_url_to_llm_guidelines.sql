-- Add PDF URL column to llm_guidelines table
-- Allows storing PDF file URLs instead of plain text templates

ALTER TABLE llm_guidelines 
ADD COLUMN IF NOT EXISTS pdf_url TEXT,
ADD COLUMN IF NOT EXISTS pdf_extracted_text TEXT; -- Cache extracted text for performance

-- Update constraint: template OR pdf_url should be provided
-- Drop existing constraint if it exists
ALTER TABLE llm_guidelines
DROP CONSTRAINT IF EXISTS check_template_or_pdf;

-- Add new constraint (allows NULL template if pdf_url exists)
ALTER TABLE llm_guidelines
ADD CONSTRAINT check_template_or_pdf CHECK (
  (template IS NOT NULL AND template != '') OR 
  (pdf_url IS NOT NULL AND pdf_url != '') OR
  (template IS NULL AND pdf_url IS NOT NULL)
);
