import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { seedAutonomousAgents } from "@/lib/autonomous-agents/seed";

export async function POST() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace" }, { status: 400 });
    }

    const agents = await seedAutonomousAgents(profile.workspace_id);
    return NextResponse.json({ agents });
  } catch (error: unknown) {
    console.error("Seed autonomous agents error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message, agents: [] }, { status: 500 });
  }
}
