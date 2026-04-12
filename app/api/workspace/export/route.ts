import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { reportError } from "@/lib/report-error";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/workspace/export
 *
 * Streams a JSON file containing all Customer Data for the caller's
 * workspace. Satisfies GDPR Art. 20 (data portability) and the
 * "I want to leave — give me my data" enterprise procurement ask.
 *
 * Only workspace admins/owners may export. The act of exporting is
 * itself recorded in the audit log.
 *
 * The shape of the exported JSON is intentionally flat and
 * self-describing so customers can re-import into another system
 * or ingest into their own warehouse without needing our schema.
 */

// Tables we export. Each entry is [table, filter-column]. The
// filter column MUST be workspace_id (we never cross workspace
// boundaries). If a table is missing in a given installation it
// is silently skipped — schemas drift and we don't want the
// export button to return 500 on a missing table.
const WORKSPACE_TABLES: Array<{ table: string; column: string }> = [
  { table: "workspaces", column: "id" },
  { table: "workspace_settings", column: "workspace_id" },
  { table: "profiles", column: "workspace_id" },
  { table: "agents", column: "workspace_id" },
  { table: "scenarios", column: "workspace_id" },
  { table: "steps", column: "workspace_id" },
  { table: "step_branches", column: "workspace_id" },
  { table: "contacts", column: "workspace_id" },
  { table: "conversations", column: "workspace_id" },
  { table: "appointments", column: "workspace_id" },
  { table: "automations", column: "workspace_id" },
  { table: "documents", column: "workspace_id" },
  { table: "knowledge_base", column: "workspace_id" },
  { table: "llm_guidelines", column: "workspace_id" },
  { table: "deployments", column: "workspace_id" },
  { table: "sales_records", column: "workspace_id" },
  { table: "scheduled_emails", column: "workspace_id" },
  { table: "tasks", column: "workspace_id" },
  { table: "audit_logs", column: "workspace_id" },
];

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace" }, { status: 400 });
    }

    if (!["admin", "owner"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Only workspace admins and owners can export workspace data." },
        { status: 403 }
      );
    }

    const workspaceId = profile.workspace_id;
    const data: Record<string, unknown[]> = {};
    const errors: Record<string, string> = {};

    for (const { table, column } of WORKSPACE_TABLES) {
      try {
        const { data: rows, error } = await supabaseAdmin
          .from(table)
          .select("*")
          .eq(column, workspaceId);

        if (error) {
          // PGRST205 = table not found. Skip gracefully.
          if (error.code === "PGRST205" || error.message?.includes("does not exist")) {
            continue;
          }
          errors[table] = error.message;
          continue;
        }
        data[table] = rows ?? [];
      } catch (err: any) {
        errors[table] = err?.message || String(err);
      }
    }

    const payload = {
      export_format_version: 1,
      exported_at: new Date().toISOString(),
      workspace_id: workspaceId,
      exported_by: {
        user_id: user.id,
        email: user.email,
      },
      tables: data,
      ...(Object.keys(errors).length > 0 ? { warnings: errors } : {}),
    };

    await logAudit({
      workspaceId,
      actorId: user.id,
      actorEmail: user.email ?? null,
      action: "workspace.data_exported",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: {
        tables_exported: Object.keys(data).length,
        rows_exported: Object.values(data).reduce((n, rows) => n + rows.length, 0),
      },
      request: req,
    });

    const body = JSON.stringify(payload, null, 2);
    const filename = `drift-export-${workspaceId}-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    reportError("workspace.export")(error);
    return NextResponse.json(
      { error: error?.message || "Export failed" },
      { status: 500 }
    );
  }
}
