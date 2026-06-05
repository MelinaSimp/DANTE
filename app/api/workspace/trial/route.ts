// app/api/workspace/trial/route.ts
//
// Self-service trial workspace provisioning. Creates a new workspace
// with plan_status="trialing" and a 14-day trial_ends_at. The
// authenticated user becomes the owner.
//
// Called during signup when the user chooses "Start free trial"
// instead of entering an existing workspace code.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

const TRIAL_DAYS = 14;

function generateInviteCode(): string {
  const hex = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `DRIFT-${hex}`;
}

export async function POST() {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check if user already has a workspace
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.workspace_id) {
    return NextResponse.json(
      { error: "You already belong to a workspace" },
      { status: 409 },
    );
  }

  // Build workspace name from user's name
  const firstName = user.user_metadata?.first_name || "";
  const lastName = user.user_metadata?.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const workspaceName = fullName ? `${fullName}'s workspace` : "My workspace";

  const trialEndsAt = new Date(
    Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Create the trial workspace
  const { data: workspace, error: wsError } = await supabaseAdmin
    .from("workspaces")
    .insert({
      name: workspaceName,
      plan_tier: "starter",
      plan_status: "trialing",
      plan_seats: 1,
      invite_code: generateInviteCode(),
      trial_ends_at: trialEndsAt,
      industry: "real_estate",
      owner_id: user.id,
    })
    .select("id, name, invite_code, trial_ends_at")
    .single();

  if (wsError) {
    console.error("[trial] workspace creation failed:", wsError);
    return NextResponse.json(
      { error: "Failed to create trial workspace" },
      { status: 500 },
    );
  }

  // Assign user to the workspace as owner
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      workspace_id: workspace.id,
      role: "owner",
    })
    .eq("id", user.id);

  if (profileError) {
    console.error("[trial] profile update failed:", profileError);
    // Clean up the orphaned workspace
    await supabaseAdmin.from("workspaces").delete().eq("id", workspace.id);
    return NextResponse.json(
      { error: "Failed to assign workspace" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    workspace_id: workspace.id,
    workspace_name: workspace.name,
    invite_code: workspace.invite_code,
    trial_ends_at: workspace.trial_ends_at,
    trial_days: TRIAL_DAYS,
  });
}
