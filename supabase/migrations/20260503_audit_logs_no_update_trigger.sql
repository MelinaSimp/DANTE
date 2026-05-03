-- 20260503_audit_logs_no_update_trigger.sql
--
-- audit_logs already has RLS policies blocking authenticated UPDATE,
-- DELETE, and INSERT. But the application uses supabaseAdmin (service
-- role) for legitimate INSERTs (retention worker, erasure runner,
-- admin actions, etc.) — and service role bypasses RLS by design.
-- Net result: any code path that uses supabaseAdmin can also UPDATE
-- existing audit rows, silently rewriting history.
--
-- This trigger fires regardless of role (Postgres triggers run on
-- all roles unless explicitly suppressed) and rejects every UPDATE
-- against audit_logs. Tamper-evidence at the database boundary,
-- independent of what the application layer does.
--
-- DELETE is intentionally NOT blocked here: the workspace-erasure
-- runner (lib/erasure/runner.ts) needs to delete audit rows when a
-- customer fully offboards. That path is itself gated by the
-- erasure_requests confirmation_token + (after the recent change)
-- the legal_hold check, so it's a controlled deletion. Tampering
-- with existing rows — forging an action, rewriting an actor, fixing
-- up a metadata field after the fact — is the higher-risk vector
-- and the one this trigger closes.
--
-- A future migration can layer on a hash-chain column for full WORM
-- semantics; this trigger is the minimal first step.

CREATE OR REPLACE FUNCTION audit_logs_block_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only — UPDATE is not permitted (id=%, action=%)',
    OLD.id, OLD.action
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_block_update();

COMMENT ON FUNCTION audit_logs_block_update IS
  'Trigger function backing audit_logs_no_update. Raises insufficient_privilege on any UPDATE against audit_logs, regardless of role. Defense-in-depth past the RLS UPDATE policy, which only binds the authenticated role and is bypassed by service_role calls.';
