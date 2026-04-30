// Sync runner — drives an integration_connections row through one
// sync cycle and writes the results to integration_sync_runs.
//
// Used by:
//   POST /api/integrations/[provider]/sync   — manual run
//   GET  /api/integrations/cron              — daily cron sweep

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdapter } from "./adapter";

export async function runOneConnection(
  connectionId: string,
  trigger: "cron" | "manual" | "webhook" = "manual",
  triggeredBy?: string,
): Promise<{ runId: string; ok: boolean; error?: string }> {
  const { data: connection } = await supabaseAdmin
    .from("integration_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection) return { runId: "", ok: false, error: "Connection not found" };

  if ((connection as any).status === "revoked") {
    return { runId: "", ok: false, error: "Connection is revoked" };
  }

  const { data: runRow } = await supabaseAdmin
    .from("integration_sync_runs")
    .insert({
      workspace_id: (connection as any).workspace_id,
      connection_id: connectionId,
      provider: (connection as any).provider,
      trigger,
      triggered_by: triggeredBy || null,
    })
    .select("id")
    .single();
  const runId = (runRow as any)?.id as string;

  const adapter = await getAdapter((connection as any).provider);
  if (!adapter) {
    await supabaseAdmin
      .from("integration_sync_runs")
      .update({
        completed_at: new Date().toISOString(),
        errors_count: 1,
        error_text: "Adapter not loaded",
      })
      .eq("id", runId);
    return { runId, ok: false, error: "Adapter not loaded" };
  }

  try {
    const result = await adapter.sync(connection as any);
    await supabaseAdmin
      .from("integration_sync_runs")
      .update({
        completed_at: new Date().toISOString(),
        records_pulled: result.records_pulled,
        records_upserted: result.records_upserted,
        records_skipped: result.records_skipped,
        errors_count: result.errors_count,
        error_text: result.error_text || null,
        metadata: result.cursor || {},
      })
      .eq("id", runId);
    await supabaseAdmin
      .from("integration_connections")
      .update({
        sync_state: result.cursor || {},
        last_sync_at: new Date().toISOString(),
        last_sync_status: result.errors_count > 0 ? "partial" : "ok",
        last_sync_error: result.error_text || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
    return { runId, ok: result.errors_count === 0, error: result.error_text };
  } catch (err: any) {
    await supabaseAdmin
      .from("integration_sync_runs")
      .update({
        completed_at: new Date().toISOString(),
        errors_count: 1,
        error_text: err?.message || "Sync threw",
      })
      .eq("id", runId);
    await supabaseAdmin
      .from("integration_connections")
      .update({
        last_sync_status: "error",
        last_sync_error: err?.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
    return { runId, ok: false, error: err?.message };
  }
}
