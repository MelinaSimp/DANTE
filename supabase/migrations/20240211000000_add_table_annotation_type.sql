-- Allow "table" annotation type: mark a data table with a comment so the LLM can find it in another PDF
ALTER TABLE document_annotations
  DROP CONSTRAINT IF EXISTS document_annotations_type_check;

ALTER TABLE document_annotations
  ADD CONSTRAINT document_annotations_type_check
  CHECK (type IN ('highlight', 'comment', 'tag', 'table'));
