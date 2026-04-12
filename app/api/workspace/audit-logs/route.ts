import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { reportError } from "@/lib/report-error";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspace/audit-logs?limit=100&before=<iso>
 *
 * Returns recent audit log entries for the caller's workspace.
 * Only workspace admins/owners may read. Members and unauthenticated
 * users are denied.
 *
 * The RLS policy on audit_logs also enforces admin/owner — we check
 * in the route handler for a clearer error message and to use the
 * service-role client (which gives us joins across auth tables
 * without complicating the SELECT policy).
 */
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

    if (!can(profile.role, "workspace.view_audit_log")) {
      return NextResponse.json(
        { error: "Audit logs are only available to workspace admins and owners." },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get("limit") || "100", 10);
    const limit = Math.max(1, Math.min(isNaN(limitParam) ? 100 : limitParam, 500));
    const before = url.searchParams.get("before");

    let query = supabaseAdmin
      .from("audit_logs")
      .select(
        "id, actor_id, actor_email, action, target_type, target_id, target_label, metadata, ip_address, created_at"
      )
      .eq("workspace_id", profile.workspace_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data, error } = await query;
    if (error) {
      reportError("audit-logs.list")(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: data ?? [] });
  } catch (error: any) {
    reportError("audit-logs.list")(error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
