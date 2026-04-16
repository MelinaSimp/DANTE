import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    const wid = profile?.workspace_id;
    if (!wid) return NextResponse.json([]);

    const params = req.nextUrl.searchParams;
    const agentId = params.get("agentId");
    const status = params.get("status");

    let query = supabaseAdmin
      .from("wm_agent_tasks")
      .select("*, wm_agent_definitions(name, icon, color_class)")
      .eq("workspace_id", wid)
      .order("created_at", { ascending: false })
      .limit(100);

    if (agentId) query = query.eq("agent_id", agentId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      console.error("Fetch tasks error:", error);
      return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Tasks GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
