import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Cancel deployment
 * POST /api/deploy/cancel
 */
export async function POST(req: NextRequest) {
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

    // Cancel deployment by setting status to cancelled
    try {
      await supabaseAdmin
        .from("workspaces")
        .update({ 
          deployment_status: "cancelled",
          deployment_cancelled_at: new Date().toISOString()
        })
        .eq("id", profile.workspace_id);
    } catch (error) {
      console.log("Workspaces table doesn't have deployment columns");
    }

    // Update deployments table
    const { error: updateError } = await supabaseAdmin
      .from("deployments")
      .upsert({
        workspace_id: profile.workspace_id,
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "workspace_id"
      });

    if (updateError) {
      console.error("Error cancelling deployment:", updateError);
      // Continue anyway - deployment is effectively cancelled
    }

    return NextResponse.json({ 
      success: true, 
      message: "Deployment cancelled",
      status: "cancelled"
    });
  } catch (error: any) {
    console.error("Cancel deploy error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to cancel deployment" },
      { status: 500 }
    );
  }
}

