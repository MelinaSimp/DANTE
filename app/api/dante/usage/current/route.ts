// Returns the active workspace's MTD usage status. Powers the
// <UsageBanner /> hook + /settings/usage page.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getUsageStatus } from "@/lib/dante/model-router";
import { maybeNotifyOverage } from "@/lib/dante/usage/notify";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  const status = await getUsageStatus(profile.workspace_id);
  if (!status) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Fire-and-forget overage notification — deduped via the
  // notifications table so calling this on every banner poll is
  // cheap. Don't await; never let an email failure block the API.
  void maybeNotifyOverage({ workspaceId: profile.workspace_id, status });

  return NextResponse.json(status);
}
