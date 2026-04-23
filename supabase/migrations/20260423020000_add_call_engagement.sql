-- Per-call engagement analysis: topics discussed + client's apparent
-- interest level per topic, derived from transcript tone/response
-- patterns. Feeds Dante's churn signal (a client who was "low interest"
-- when the advisor pitched a specific product is a churn risk on that
-- product line) and renders on the call audit view.
--
-- Shape:
-- {
--   "overall_interest": 0-100,
--   "topics": [
--     { "topic": "529 plan", "interest": "high"|"medium"|"low",
--       "evidence": "asked 3 questions about tax treatment",
--       "segment_ids": [7, 12, 14] }
--   ]
-- }

alter table call_recordings
  add column if not exists engagement jsonb;
