// app/api/emails/triage/route.ts
//
// Manual / on-demand triage trigger for the current user's workspace.
// Calls the same lib function the cron uses, capped at 40 emails per
// invocation so latency stays under the Vercel route limit.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { triageWorkspaceEmails } from "@/lib/emails/triage";

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

  const result = await triageWorkspaceEmails(
    supabase as any,
    profile.workspace_id,
    40
  );
  return NextResponse.json(result);
}
