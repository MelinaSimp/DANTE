import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ outputId: string }> }
) {
  try {
    const { outputId } = await params;
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
    const { review_status } = body;

    if (!["APPROVED", "DISMISSED"].includes(review_status)) {
      return NextResponse.json({ error: "Invalid review_status" }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("wm_agent_outputs")
      .select("id, agent_id, review_status")
      .eq("id", outputId)
      .eq("workspace_id", wid)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Output not found" }, { status: 404 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from("wm_agent_outputs")
      .update({ review_status })
      .eq("id", outputId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    if (existing.review_status === "PENDING" && review_status !== "PENDING") {
      try {
        await supabaseAdmin.rpc("decrement_pending_reviews", {
          p_agent_id: existing.agent_id,
        });
      } catch {
        // Fallback: manually decrement
        const { data: agentData } = await supabaseAdmin
          .from("wm_agent_definitions")
          .select("pending_reviews")
          .eq("id", existing.agent_id)
          .single();
        if (agentData) {
          await supabaseAdmin
            .from("wm_agent_definitions")
            .update({ pending_reviews: Math.max(0, (agentData.pending_reviews || 0) - 1) })
            .eq("id", existing.agent_id);
        }
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Output PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
