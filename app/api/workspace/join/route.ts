import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await req.json();
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
  }

  const trimmed = code.trim().toUpperCase();

  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("id, name")
    .eq("invite_code", trimmed)
    .maybeSingle();

  if (!workspace) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ workspace_id: workspace.id })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, workspace_id: workspace.id, workspace_name: workspace.name });
}
