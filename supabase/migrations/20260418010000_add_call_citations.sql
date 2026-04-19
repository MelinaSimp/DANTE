-- Grounded call summaries — every claim in the AI summary traces to an
-- exact transcript segment so a compliance officer can verify the source.
--
-- transcript_segments: Whisper verbose_json segments array. Each entry:
--   { id, start, end, text }
-- summary_structured: the LLM's structured output:
--   {
--     tldr: "2-3 sentence overview",
--     key_points:   [{ text, cite_segments: [int] }, ...],
--     action_items: [{ text, owner, deadline, cite_segments: [int] }, ...],
--     follow_ups:   [{ text, cite_segments: [int] }, ...],
--     verified_count: int,
--     total_claims: int
--   }

alter table call_recordings
  add column if not exists transcript_segments jsonb,
  add column if not exists summary_structured jsonb;
