import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { WMDashboardService } from "@/lib/services/wm-dashboard.service";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("workspace_id").eq("id", user.id).maybeSingle();
    if (!profile?.workspace_id) {
      return NextResponse.json({ agents: [], workload: { totalAgents: 0, running: 0, idle: 0, paused: 0, errors: 0, reviewNeeded: 0, totalOutputsToday: 0, totalPendingReviews: 0, totalQueueItems: 0 } });
    }

    const result = await WMDashboardService.getAgents(profile.workspace_id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Dashboard agents error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
