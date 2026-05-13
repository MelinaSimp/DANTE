-- 20260513_vault_ingest_queue.sql
--
-- Durable work queue for vault document ingestion (chunking,
-- embedding, indexing). Replaces fire-and-forget Edge Function
-- invocations with a claimable queue that supports retries,
-- exponential backoff, dead-lettering, and distributed locking.
--
-- Workers call claim_ingest_jobs() to atomically grab a batch,
-- then update status on completion or failure. A periodic sweep
-- via release_stale_ingest_locks() catches crashed workers.

-- ── Table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vault_ingest_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_item_id   UUID NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  requested_by    UUID,
  source          TEXT NOT NULL DEFAULT 'watched_folder'
                    CHECK (source IN ('watched_folder','upload','reingest','backfill')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','completed','failed','dead')),
  priority        INT NOT NULL DEFAULT 0,
  attempts        INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 3,
  last_error      TEXT,
  chunk_count     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  run_after       TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by       TEXT,
  locked_at       TIMESTAMPTZ
);

-- ── Indexes ───────────────────────────────────────────────────────

-- Worker's primary claim query: pending/failed jobs ready to run,
-- ordered by priority then age.
CREATE INDEX idx_vault_ingest_queue_pending
  ON vault_ingest_queue (status, run_after, priority DESC, created_at)
  WHERE status IN ('pending', 'failed');

-- Dashboard / progress queries scoped to a workspace.
CREATE INDEX idx_vault_ingest_queue_workspace_status
  ON vault_ingest_queue (workspace_id, status);

-- Dedup lookups: "is this vault_item already queued?"
CREATE INDEX idx_vault_ingest_queue_vault_item
  ON vault_ingest_queue (vault_item_id);

-- ── RLS ───────────────────────────────────────────────────────────

ALTER TABLE vault_ingest_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vault_ingest_queue_select ON vault_ingest_queue;
CREATE POLICY vault_ingest_queue_select ON vault_ingest_queue
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- ── claim_ingest_jobs RPC ─────────────────────────────────────────
--
-- Atomically claim up to p_batch_size jobs using FOR UPDATE SKIP
-- LOCKED so multiple workers never grab the same row. Returns the
-- claimed rows so the caller knows what to process.

CREATE OR REPLACE FUNCTION public.claim_ingest_jobs(
  p_worker_id  TEXT,
  p_batch_size INT DEFAULT 5
)
RETURNS SETOF vault_ingest_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT id
    FROM vault_ingest_queue
    WHERE status IN ('pending', 'failed')
      AND run_after <= now()
      AND attempts < max_attempts
    ORDER BY priority DESC, created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE vault_ingest_queue q
  SET status     = 'running',
      locked_by  = p_worker_id,
      locked_at  = now(),
      started_at = COALESCE(q.started_at, now()),
      attempts   = q.attempts + 1
  FROM claimable c
  WHERE q.id = c.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ingest_jobs(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ingest_jobs(TEXT, INT) TO service_role;

-- ── release_stale_ingest_locks RPC ────────────────────────────────
--
-- Catches workers that crashed or timed out. Jobs that have
-- exhausted their retries move to 'dead'; others go back to
-- 'failed' with exponential backoff (2^attempts * 30s).

CREATE OR REPLACE FUNCTION public.release_stale_ingest_locks(
  p_stale_threshold INTERVAL DEFAULT '5 minutes'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released INT;
BEGIN
  WITH stale AS (
    SELECT id, attempts, max_attempts
    FROM vault_ingest_queue
    WHERE status = 'running'
      AND locked_at < now() - p_stale_threshold
    FOR UPDATE SKIP LOCKED
  )
  UPDATE vault_ingest_queue q
  SET status    = CASE
                    WHEN s.attempts >= s.max_attempts THEN 'dead'
                    ELSE 'failed'
                  END,
      run_after = CASE
                    WHEN s.attempts >= s.max_attempts THEN q.run_after
                    ELSE now() + (power(2, s.attempts) * INTERVAL '30 seconds')
                  END,
      locked_by  = NULL,
      locked_at  = NULL,
      last_error = COALESCE(q.last_error, '') || ' [stale lock released]'
  FROM stale s
  WHERE q.id = s.id;

  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_ingest_locks(INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_stale_ingest_locks(INTERVAL) TO service_role;
