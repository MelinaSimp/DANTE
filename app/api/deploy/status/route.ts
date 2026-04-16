import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Get deployment status
 * GET /api/deploy/status
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
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Get deployment status from deployments table
    const { data: deployment, error: deployError } = await supabaseAdmin
      .from("deployments")
      .select("status, started_at, cancelled_at, error")
      .eq("workspace_id", profile.workspace_id)
      .maybeSingle();

    // Fallback to workspaces table if deployments table doesn't exist
    let status = "idle";
    let startedAt, cancelledAt, error;

    if (deployment) {
      status = deployment.status || "idle";
      startedAt = deployment.started_at;
      cancelledAt = deployment.cancelled_at;
      error = deployment.error;
    } else {
      // Try workspaces table as fallback
      try {
        const { data: workspace } = await supabaseAdmin
          .from("workspaces")
          .select("deployment_status, deployment_started_at, deployment_cancelled_at, deployment_error")
          .eq("id", profile.workspace_id)
          .maybeSingle();
        
        if (workspace) {
          status = workspace.deployment_status || "idle";
          startedAt = workspace.deployment_started_at;
          cancelledAt = workspace.deployment_cancelled_at;
          error = workspace.deployment_error;
        }
      } catch (error) {
        // Workspaces table doesn't have these columns, use defaults
      }
    }

    const isDeployed = status === "deploying" || status === "deployed";

    return NextResponse.json({ 
      status,
      isDeployed,
      startedAt,
      cancelledAt,
      error
    });
  } catch (error: any) {
    console.error("Get status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get deployment status" },
      { status: 500 }
    );
  }
}

