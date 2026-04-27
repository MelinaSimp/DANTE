// app/api/emails/categorize/route.ts
//
// Manual / on-demand categorize trigger for the current user's
// workspace. Idempotent — only processes rows where categorized_at
// is null. Up to 25 per call to keep latency under the Vercel limit.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { categorizeWorkspaceEmails } from "@/lib/emails/categorize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("industry")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  const result = await categorizeWorkspaceEmails(
    supabase as any,
    profile.workspace_id,
    workspace?.industry,
    25
  );
  return NextResponse.json(result);
}
