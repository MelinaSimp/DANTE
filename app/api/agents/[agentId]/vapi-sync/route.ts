/**
 * VAPI Sync API Route
 * Syncs a Drift agent to VAPI (creates/updates VAPI assistant + imports phone number)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncAgentToVapi, importPhoneToVapi } from "@/lib/vapi/sync";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  // Verify auth
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify workspace ownership
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  // Verify agent belongs to workspace
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("id, phone_number, voice_provider")
    .eq("id", agentId)
    .eq("workspace_id", profile.workspace_id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (!process.env.VAPI_API_KEY) {
    return NextResponse.json({ error: "VAPI_API_KEY is not configured" }, { status: 500 });
  }

  try {
    // Sync agent config to VAPI assistant
    const { assistantId } = await syncAgentToVapi(agentId);

    // If agent has a phone number, import it into VAPI
    let phoneNumberId: string | null = null;
    if (agent.phone_number) {
      try {
        const result = await importPhoneToVapi(agentId, agent.phone_number, assistantId);
        phoneNumberId = result.phoneNumberId;
      } catch (phoneErr: any) {
        console.error("[VAPI Sync] Phone import failed (non-fatal):", phoneErr.message);
        // Don't fail the whole sync if phone import fails — assistant is still created
      }
    }

    return NextResponse.json({
      success: true,
      assistantId,
      phoneNumberId,
    });
  } catch (err: any) {
    console.error("[VAPI Sync] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
