import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

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
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  const body = await req.json();
  const { gradient_color } = body;

  if (!gradient_color || typeof gradient_color !== "string") {
    return NextResponse.json({ error: "gradient_color is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("agents")
    .update({ gradient_color })
    .eq("id", agentId)
    .eq("workspace_id", profile.workspace_id);

  if (error) {
    console.error("Failed to update gradient_color:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
