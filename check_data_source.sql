-- Check what's actually in the data source
SELECT 
  id,
  name,
  type,
  LEFT(content, 500) as content_preview,
  LENGTH(content) as content_length,
  CASE 
    WHEN content IS NULL OR content = '' THEN 'NO CONTENT ❌'
    WHEN content LIKE '%24/7%' OR content LIKE '%24 hours%' THEN 'CONTAINS 24/7 ✅'
    ELSE 'HAS CONTENT ✅'
  END as content_status
FROM agent_data_sources
WHERE agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';
