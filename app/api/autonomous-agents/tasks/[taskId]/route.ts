import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    const wid = profile?.workspace_id;
    if (!wid) return NextResponse.json({ error: "No workspace" }, { status: 400 });

    const body = await req.json();
    const { status } = body;

    if (!["COMPLETED", "DISMISSED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from("wm_agent_tasks")
      .update({ status, completed_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("workspace_id", wid)
      .select("*")
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: "Task not found or update failed" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Task PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
