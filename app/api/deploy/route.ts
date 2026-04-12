import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Deploy to Vercel
 * POST /api/deploy
 * 
 * Sets deployment status to "deploying" which locks the UI.
 * Actual deployment should be done via: vercel --prod
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

    // Store deployment status in deployments table
    const { error: deployError } = await supabaseAdmin
      .from("deployments")
      .upsert({
        workspace_id: profile.workspace_id,
        status: "deploying",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "workspace_id"
      });

    if (deployError) {
      // If table doesn't exist, log but continue
      console.error("Error storing deployment status:", deployError);
    }

    await logAudit({
      workspaceId: profile.workspace_id,
      actorId: user.id,
      actorEmail: user.email ?? null,
      action: "agent.deployed",
      targetType: "workspace",
      targetId: profile.workspace_id,
      request: req,
    });

    return NextResponse.json({
      success: true,
      message: "Deployment started. Changes are now locked.",
      status: "deploying"
    });
  } catch (error: any) {
    console.error("Deploy error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start deployment" },
      { status: 500 }
    );
  }
}

