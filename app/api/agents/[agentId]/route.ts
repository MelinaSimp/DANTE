import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

async function getWorkspace(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { workspaceId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  return { workspaceId: profile?.workspace_id ?? null };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify agent belongs to workspace
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("workspace_id")
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await req.json();
  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (body.name !== undefined) updates.name = body.name;
  if (body.modality !== undefined) updates.modality = body.modality;
  if (body.description !== undefined) updates.description = body.description;
  if (body.phone_number !== undefined) {
    // Normalize phone number to E.164 format before saving
    const normalized = normalizePhone(body.phone_number);
    updates.phone_number = normalized || body.phone_number; // Fallback to original if normalization fails
  }
  if (body.status !== undefined) updates.status = body.status;
  if (body.elevenlabs_voice_id !== undefined) updates.elevenlabs_voice_id = body.elevenlabs_voice_id;
  // New fields for agent role and specialist routing
  if (body.agent_role !== undefined) updates.agent_role = body.agent_role;
  if (body.is_specialist !== undefined) updates.is_specialist = body.is_specialist;
  if (body.parent_agent_id !== undefined) updates.parent_agent_id = body.parent_agent_id;
  if (body.routing_keywords !== undefined) updates.routing_keywords = body.routing_keywords;
  if (body.llm_instructions !== undefined) updates.llm_instructions = body.llm_instructions;
  if (body.first_message !== undefined) updates.first_message = body.first_message;
  if (body.llm_model !== undefined) updates.llm_model = body.llm_model;
  if (body.voice_provider !== undefined) updates.voice_provider = body.voice_provider;
  if (body.mode === "llm" || body.mode === "scenario") updates.mode = body.mode;
  if (body.scenario === null || (body.scenario && typeof body.scenario === "object")) {
    updates.scenario = body.scenario;
  }
  if (body.vapi_assistant_id !== undefined) updates.vapi_assistant_id = body.vapi_assistant_id;
  if (body.vapi_phone_number_id !== undefined) updates.vapi_phone_number_id = body.vapi_phone_number_id;
  // Business-hours schedule + after-hours transfer routing. Stored as
  // opaque jsonb / text; the webhook (handleAssistantRequest) reads
  // these on every inbound call to decide in-hours vs after-hours.
  if (body.schedule_enabled !== undefined) updates.schedule_enabled = !!body.schedule_enabled;
  if (body.schedule === null || (body.schedule && typeof body.schedule === "object")) {
    updates.schedule = body.schedule;
  }
  if (body.after_hours_transfer_to !== undefined) {
    const raw = typeof body.after_hours_transfer_to === "string"
      ? body.after_hours_transfer_to.trim()
      : null;
    updates.after_hours_transfer_to = raw && raw.length > 0 ? raw : null;
  }
  // Web widget channel — independent of the voice deploy state above.
  // widget_public_id is intentionally NOT settable here; it's a
  // server-managed token. Rotating it is a separate explicit action.
  if (body.widget_enabled !== undefined) updates.widget_enabled = !!body.widget_enabled;
  if (body.widget_config === null || (body.widget_config && typeof body.widget_config === "object")) {
    updates.widget_config = body.widget_config;
  }

  const { data, error } = await supabaseAdmin
    .from("agents")
    .update(updates)
    .eq("id", agentId)
    .select("*")
    .single();

  if (error) {
    console.error("Failed to update agent", error);
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
  }

  // Auto-sync to VAPI when deploying with voice_provider = "vapi"
  if (data.status === "deployed" && data.voice_provider === "vapi" && body.status === "deployed") {
    try {
      const { syncAgentToVapi, importPhoneToVapi } = await import("@/lib/vapi/sync");
      
      const { assistantId } = await syncAgentToVapi(agentId);
      console.log(`[Deploy] Auto-synced agent ${agentId} to VAPI assistant ${assistantId}`);

      if (data.phone_number) {
        try {
          await importPhoneToVapi(agentId, data.phone_number, assistantId);
          console.log(`[Deploy] Imported phone number ${data.phone_number} into VAPI`);

          // Schedule-aware wiring. When the agent has a schedule, switch
          // the phone-number to dynamic mode so VAPI calls our
          // assistant-request webhook on every inbound call (so the
          // handler can do the in-hours / after-hours decision per-call).
          // When schedule_enabled is false, leave the static binding
          // importPhoneToVapi just created.
          //
          // VAPI's PATCH on /phone-number/{id} accepts both fields:
          // clearing assistantId + setting server.url makes the next call
          // hit the webhook instead of the static assistant.
          if (data.schedule_enabled) {
            const { updatePhoneNumber } = await import("@/lib/vapi/client");
            const { getAppUrl } = await import("@/lib/app-url");
            const serverUrl = `${getAppUrl()}/api/vapi/server-url`;
            const { data: agentRow } = await supabaseAdmin
              .from("agents")
              .select("vapi_phone_number_id")
              .eq("id", agentId)
              .single();
            if (agentRow?.vapi_phone_number_id) {
              await updatePhoneNumber(agentRow.vapi_phone_number_id, {
                assistantId: null,
                server: { url: serverUrl },
              });
              console.log(`[Deploy] Switched phone to dynamic mode for scheduled agent ${agentId}`);
            }
          }
        } catch (phoneErr: any) {
          console.error(`[Deploy] Phone import failed (non-fatal):`, phoneErr.message);
        }
      }
    } catch (vapiErr: any) {
      console.error(`[Deploy] VAPI sync failed (non-fatal):`, vapiErr.message);
    }
  }

  // Clean up VAPI resources when switching back to custom or undeploying
  if (
    (body.voice_provider === "custom" && data.vapi_assistant_id) ||
    (body.status === "draft" && data.voice_provider === "vapi" && data.vapi_assistant_id)
  ) {
    try {
      const { removeVapiResources, reconfigureTwilioWebhook } = await import("@/lib/vapi/sync");
      await removeVapiResources(agentId);
      if (data.phone_number) {
        await reconfigureTwilioWebhook(data.phone_number);
      }
      console.log(`[Deploy] Cleaned up VAPI resources for agent ${agentId}`);
    } catch (cleanupErr: any) {
      console.error(`[Deploy] VAPI cleanup failed (non-fatal):`, cleanupErr.message);
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify agent belongs to workspace
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("workspace_id")
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("agents")
    .delete()
    .eq("id", agentId);

  if (error) {
    console.error("Failed to delete agent", error);
    return NextResponse.json({ error: "Failed to delete agent" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

