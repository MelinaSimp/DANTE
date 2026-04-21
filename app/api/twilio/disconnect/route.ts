// POST /api/twilio/disconnect
//
// Removes the workspace's Twilio credentials. Does NOT detach numbers
// from agents — if they reconnect, those assignments are still valid.
// This is strictly about the credential pair.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST() {
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
    .maybeSingle();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!isWorkspaceAdmin(profile.role)) {
    return NextResponse.json(
      { error: "Only workspace admins can manage Twilio credentials." },
      { status: 403 },
    );
  }

  const { error } = await supabaseAdmin
    .from("twilio_credentials")
    .delete()
    .eq("workspace_id", profile.workspace_id);

  if (error) {
    console.error("[twilio/disconnect] delete failed:", error);
    return NextResponse.json(
      { error: "Failed to disconnect. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
