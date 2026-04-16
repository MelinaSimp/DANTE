import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import twilio from "twilio";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Send a manual reply to a conversation
 * POST /api/conversations/[conversationId]/reply
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { message } = await req.json();

    if (!message || !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Load conversation
    const { data: conversation, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("*, agent_id, workspace_id, from_number, to_number, transcript")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Get agent to get phone number
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("phone_number, workspace_id")
      .eq("id", conversation.agent_id)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Get Twilio credentials
    let accountSid: string | null = null;
    let authToken: string | null = null;

    const { data: twilioCreds } = await supabaseAdmin
      .from("twilio_credentials")
      .select("account_sid, auth_token")
      .eq("workspace_id", agent.workspace_id)
      .maybeSingle();

    if (twilioCreds?.account_sid && twilioCreds?.auth_token) {
      accountSid = twilioCreds.account_sid;
      authToken = twilioCreds.auth_token;
    } else {
      // Fallback to environment variables
      accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_MASTER_ACCOUNT_SID || null;
      authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_MASTER_AUTH_TOKEN || null;
    }

    if (!accountSid || !authToken) {
      return NextResponse.json({ error: "Twilio credentials not found" }, { status: 500 });
    }

    // Normalize phone numbers
    const fromNumber = agent.phone_number || conversation.to_number;
    const toNumber = conversation.from_number;

    if (!fromNumber || !toNumber) {
      return NextResponse.json({ error: "Phone numbers not found" }, { status: 400 });
    }

    const normalizedFrom = normalizePhone(fromNumber);
    const normalizedTo = normalizePhone(toNumber);

    if (!normalizedFrom || !normalizedTo) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    // Send SMS via Twilio
    const twilioClient = twilio(accountSid, authToken);

    let messageSid: string | null = null;
    try {
      const twilioMessage = await twilioClient.messages.create({
        body: message.trim(),
        from: normalizedFrom,
        to: normalizedTo,
      });

      messageSid = twilioMessage.sid;
      console.log("[Manual Reply] SMS sent successfully. Message SID:", messageSid);
    } catch (twilioError: any) {
      console.error("[Manual Reply] Failed to send SMS:", twilioError);
      return NextResponse.json(
        {
          error: "Failed to send SMS",
          details: twilioError.message || String(twilioError),
        },
        { status: 500 }
      );
    }

    // Add message to transcript
    const transcript = conversation.transcript || [];
    const newMessage = {
      role: "assistant",
      content: message.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedTranscript = [...transcript, newMessage];

    // Update conversation
    const { error: updateError } = await supabaseAdmin
      .from("conversations")
      .update({
        transcript: updatedTranscript,
        updated_at: new Date().toISOString(),
        // If conversation was completed, reactivate it
        status: conversation.status === "completed" ? "active" : conversation.status,
      })
      .eq("id", conversationId);

    if (updateError) {
      console.error("[Manual Reply] Failed to update conversation:", updateError);
      // Don't fail the request if transcript update fails - SMS was already sent
    }

    return NextResponse.json({
      success: true,
      messageSid,
      timestamp: newMessage.timestamp,
    });
  } catch (error: any) {
    console.error("[Manual Reply] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

