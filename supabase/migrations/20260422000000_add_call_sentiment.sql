-- Semantic sentiment on call summaries — feeds Dante's sentiment signal.
--
-- Before this, Dante's sentiment signal was a keyword scan over
-- call_recordings.summary (`frustrat`, `angry`, etc). That misses
-- clients who *sound* upset without using flagged vocabulary, and
-- false-positives on summaries that simply quote the keyword in a
-- neutral context ("the client had no concerns").
--
-- With these columns, the summarization pipeline runs a small LLM
-- classification pass after the main summary and stores a signed
-- score + categorical label. Dante reads the score directly; the
-- keyword heuristic stays as a fallback for rows without a score
-- (older calls, or calls where the classifier failed).
--
-- sentiment_score: numeric in [-1.0, +1.0]
--   +1.0 = strongly positive (happy, confident, engaged)
--    0.0 = neutral
--   -1.0 = strongly negative (frustrated, angry, disengaged)
--
-- sentiment_label: human-readable category
--   'positive' | 'neutral' | 'concerned' | 'frustrated' | 'angry'

alter table call_recordings
  add column if not exists sentiment_score numeric,
  add column if not exists sentiment_label text;
