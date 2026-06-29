import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createOutboundCall, getCall } from "@/lib/vapi/client";
import { requireActiveBilling } from "@/lib/billing/gate";
import { hasWorkspaceFeature } from "@/lib/features/server";

export const dynamic = "force-dynamic";

// POST — initiate an outbound VAPI call
export async function POST(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { phoneNumber, salesScript } = body;

  if (!phoneNumber) {
    return NextResponse.json({ error: "phoneNumber is required" }, { status: 400 });
  }

  const { data: agent, error: agentError } = await supabaseAdmin
    .from("agents")
    .select("id, vapi_assistant_id, vapi_phone_number_id, llm_instructions, name, workspace_id")
    .eq("id", agentId)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const gate = await requireActiveBilling(agent.workspace_id);
  if (!gate.ok) return gate.response;

  // Feature gate — Outbound Voice is a paid add-on. No outbound call can be
  // placed unless the workspace has it enabled.
  if (!(await hasWorkspaceFeature(agent.workspace_id, "outbound_voice"))) {
    return NextResponse.json(
      { error: "Outbound Voice is not enabled for this workspace." },
      { status: 403 },
    );
  }

  if (!agent.vapi_assistant_id || !agent.vapi_phone_number_id) {
    return NextResponse.json({
      error: "Agent must be deployed with VAPI and have a phone number configured",
    }, { status: 400 });
  }

  // TCPA compliance: check do-not-call flag before placing outbound call.
  // Matches the target phone number against all contacts in this workspace.
  const normalized = phoneNumber.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  const { data: dncHits } = await supabaseAdmin
    .from("contacts")
    .select("id, name, do_not_call")
    .eq("workspace_id", agent.workspace_id)
    .eq("do_not_call", true)
    .or(`phone.ilike.%${normalized}`)
    .limit(1);
  if (dncHits && dncHits.length > 0) {
    const hit = dncHits[0] as { id: string; name: string };
    return NextResponse.json({
      error: `Blocked by do-not-call list. Contact "${hit.name}" (${hit.id}) is flagged as DNC.`,
    }, { status: 403 });
  }

  try {
    const assistantOverrides: any = {
      maxDurationSeconds: 600,
    };

    if (salesScript) {
      const firstLine = salesScript.split("\n").find((l: string) => l.trim().length > 0)?.trim();

      const combinedPrompt = [
        "You are making an OUTBOUND sales call. You called the customer — they did NOT call you.",
        "Start the conversation with your opening line. Do NOT say 'how can I help you' — YOU are the one reaching out.",
        "Follow the sales script below as your guide.\n",
        agent.llm_instructions || "",
        "\n\n--- SALES SCRIPT ---\n" + salesScript,
      ].join("\n");

      assistantOverrides.model = {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: combinedPrompt }],
      };

      if (firstLine) {
        assistantOverrides.firstMessage = firstLine;
      }
    }

    const call = await createOutboundCall({
      assistantId: agent.vapi_assistant_id,
      phoneNumberId: agent.vapi_phone_number_id,
      customer: { number: phoneNumber },
      assistantOverrides,
    });

    return NextResponse.json({
      callId: call.id,
      status: call.status || "queued",
      phoneNumber,
    });
  } catch (err: any) {
    console.error("[Outbound Call] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — check status of a call by callId query param
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const callId = searchParams.get("callId");
  if (!callId) return NextResponse.json({ error: "callId is required" }, { status: 400 });

  try {
    const call = await getCall(callId);

    const transcript: Array<{ role: string; content: string }> = [];
    const messages = call.artifact?.messages || call.messages || [];
    for (const msg of messages) {
      if (msg.role && (msg.message || msg.content)) {
        transcript.push({
          role: msg.role === "bot" ? "assistant" : msg.role,
          content: msg.message || msg.content || "",
        });
      }
    }

    return NextResponse.json({
      callId: call.id,
      status: call.status,
      endedReason: call.endedReason,
      summary: call.artifact?.transcript || call.summary || "",
      duration: call.duration,
      recordingUrl: call.artifact?.recordingUrl || call.recordingUrl || null,
      transcript,
    });
  } catch (err: any) {
    console.error("[Call Status] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
