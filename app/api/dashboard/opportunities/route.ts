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
      return NextResponse.json({
        opportunities: [
          { id: "opp-1", type: "Idle Cash", client: "Dr. Amanda Reyes", value: "$1.2M", confidence: 95, suggestedAction: "Propose high-yield municipal bond strategy" },
          { id: "opp-2", type: "401k Rollover", client: "James & Elaine Smith", value: "$850k", confidence: 80, suggestedAction: "Discuss consolidating legacy 401k plans." },
          { id: "opp-3", type: "Estate Planning", client: "The Harrison Family", value: "Referral + Trust", confidence: 65, suggestedAction: "Business sale event. Likely needs advanced estate strategies." },
        ],
      });
    }

    const opportunities = await WMDashboardService.getRevenueDrafts(profile.workspace_id);
    return NextResponse.json({ opportunities });
  } catch (error) {
    console.error("Dashboard opportunities error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { id, action } = body;

    if (!id || !action) {
      return NextResponse.json({ error: "id and action required" }, { status: 400 });
    }

    if (action === "dismiss") {
      await WMDashboardService.dismissOpportunity(id);
    } else if (action === "approve") {
      await WMDashboardService.approveOpportunity(id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Dashboard opportunity action error:", error);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
