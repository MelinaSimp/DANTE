-- Drift CRM: fast, atomic workspace deletion.
--
-- Replaces ~30 sequential PostgREST round-trips (one DELETE per table) with a
-- single in-DB transaction. Mirrors the explicit pre-delete order the API used:
--   * audit_logs: append-only trigger blocks UPDATE cascades -> delete first.
--   * vault_* / watched_*: high-volume; SET NULL FKs pre-nulled.
--   * automation_events: NO ACTION FK; must be explicit.
-- The final DELETE FROM workspaces lets ON DELETE CASCADE handle the remaining
-- small child tables.
--
-- SECURITY DEFINER so it runs with the same privileges the service role used
-- for the per-table deletes; statement_timeout raised for large workspaces.

CREATE OR REPLACE FUNCTION delete_workspace_cascade(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '60s'
AS $$
BEGIN
  -- Vault: pre-null SET NULL FKs (no supporting index), then delete leaf->parent.
  UPDATE watched_folder_files SET vault_item_id = NULL
    WHERE vault_item_id IN (SELECT id FROM vault_items WHERE workspace_id = p_workspace_id);
  UPDATE watched_file_index SET vault_item_id = NULL
    WHERE vault_item_id IN (SELECT id FROM vault_items WHERE workspace_id = p_workspace_id);
  UPDATE lease_abstracts SET vault_item_id = NULL
    WHERE vault_item_id IN (SELECT id FROM vault_items WHERE workspace_id = p_workspace_id);

  DELETE FROM vault_item_chunks  WHERE workspace_id = p_workspace_id;
  DELETE FROM vault_ingest_queue WHERE workspace_id = p_workspace_id;
  DELETE FROM vault_items        WHERE workspace_id = p_workspace_id;
  DELETE FROM vault_projects     WHERE workspace_id = p_workspace_id;

  -- Property join table (no workspace_id of its own).
  DELETE FROM property_clients
    WHERE property_id IN (SELECT id FROM properties WHERE workspace_id = p_workspace_id);

  -- Explicit pre-deletes (append-only triggers, NO ACTION FKs, high-volume).
  DELETE FROM audit_logs              WHERE workspace_id = p_workspace_id;
  DELETE FROM automation_events       WHERE workspace_id = p_workspace_id;
  DELETE FROM watched_folder_files    WHERE workspace_id = p_workspace_id;
  DELETE FROM watched_folders         WHERE workspace_id = p_workspace_id;
  DELETE FROM watched_file_index      WHERE workspace_id = p_workspace_id;
  DELETE FROM dante_memory            WHERE workspace_id = p_workspace_id;
  DELETE FROM dante_chats             WHERE workspace_id = p_workspace_id;
  DELETE FROM dante_usage_ledger      WHERE workspace_id = p_workspace_id;
  DELETE FROM dante_workflow_runs     WHERE workspace_id = p_workspace_id;
  DELETE FROM dante_workflows         WHERE workspace_id = p_workspace_id;
  DELETE FROM usage_events            WHERE workspace_id = p_workspace_id;
  DELETE FROM error_logs              WHERE workspace_id = p_workspace_id;
  DELETE FROM sms_messages            WHERE workspace_id = p_workspace_id;
  DELETE FROM compliance_flags        WHERE workspace_id = p_workspace_id;
  DELETE FROM reminders               WHERE workspace_id = p_workspace_id;
  DELETE FROM integration_connections WHERE workspace_id = p_workspace_id;
  DELETE FROM conversations           WHERE workspace_id = p_workspace_id;
  DELETE FROM documents               WHERE workspace_id = p_workspace_id;
  DELETE FROM workspace_settings      WHERE workspace_id = p_workspace_id;
  DELETE FROM properties              WHERE workspace_id = p_workspace_id;
  DELETE FROM contacts                WHERE workspace_id = p_workspace_id;
  DELETE FROM agents                  WHERE workspace_id = p_workspace_id;
  -- NOTE: sales_records has no workspace_id (global/legacy table) and there is
  -- no `workflows` table (the real one is dante_workflows, handled above). The
  -- old route listed both; they always errored silently and are omitted here.

  -- Unlink profiles (auth-linked; never delete the user row).
  UPDATE profiles SET workspace_id = NULL WHERE workspace_id = p_workspace_id;

  -- Final row: ON DELETE CASCADE clears the remaining small child tables.
  DELETE FROM workspaces WHERE id = p_workspace_id;
END;
$$;
