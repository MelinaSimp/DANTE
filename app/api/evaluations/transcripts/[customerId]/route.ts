// app/api/evaluations/transcripts/[customerId]/route.ts
// API endpoint to fetch full conversation transcript for a customer

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export interface TranscriptMessage {
  id: string;
  type: "voice" | "text";
  role: "customer" | "ai" | "agent";
  agentName?: string;
  text: string;
  timestamp: string;
  audioUrl?: string;
  callSid?: string;
}

export interface CustomerTranscript {
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  customerEmail: string | null;
  messages: TranscriptMessage[];
  totalCalls: number;
  totalMessages: number;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const workspaceId = profile.workspace_id;
    const { customerId } = await params;

    // Find contact by ID or phone
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, name, phone, email")
      .eq("workspace_id", workspaceId)
      .or(`id.eq.${customerId},phone.eq.${customerId}`)
      .maybeSingle();

    const customerPhone = contact?.phone || customerId;
    const customerName = contact?.name || null;
    const customerEmail = contact?.email || null;
    const resolvedCustomerId = contact?.id || customerId;

    // Get all call sessions for this customer
    const { data: callSessions } = await supabase
      .from("call_sessions")
      .select("id, call_sid, from_number, transcript, created_at, updated_at, agent_id")
      .eq("workspace_id", workspaceId)
      .eq("from_number", customerPhone)
      .order("created_at", { ascending: true });

    // Get all receptionist logs for this customer
    const { data: receptionistLogs } = await supabase
      .from("receptionist_call_logs")
      .select("id, call_sid, from_number, answers, ai_response, created_at")
      .eq("workspace_id", workspaceId)
      .eq("from_number", customerPhone)
      .order("created_at", { ascending: true });

    // Get agent names if available
    const agentIds = new Set<string>();
    callSessions?.forEach(s => {
      if (s.agent_id) agentIds.add(s.agent_id);
    });

    const agentMap = new Map<string, string>();
    if (agentIds.size > 0) {
      const { data: agents } = await supabase
        .from("agents")
        .select("id, name")
        .in("id", Array.from(agentIds));

      agents?.forEach(agent => {
        agentMap.set(agent.id, agent.name);
      });
    }

    // Build messages array
    const messages: TranscriptMessage[] = [];

    // Process call sessions
    if (callSessions) {
      for (const session of callSessions) {
        const transcript = Array.isArray(session.transcript) ? session.transcript : [];
        const agentName = session.agent_id ? agentMap.get(session.agent_id) : undefined;

        transcript.forEach((msg: any, idx: number) => {
          const speaker = msg.speaker || (idx % 2 === 0 ? "ai" : "user");
          const role = speaker === "user" ? "customer" : "ai";
          
          messages.push({
            id: `${session.id}-${idx}`,
            type: "voice",
            role,
            agentName: role === "ai" ? (agentName || "AI") : undefined,
            text: msg.text || msg.message || "",
            timestamp: msg.timestamp || session.created_at,
            callSid: session.call_sid,
            // TODO: Add audio URL if recording exists
          });
        });
      }
    }

    // Process receptionist logs
    if (receptionistLogs) {
      for (const log of receptionistLogs) {
        const answers = Array.isArray(log.answers) ? log.answers : [];

        // Add customer answers
        answers.forEach((answer: any, idx: number) => {
          messages.push({
            id: `${log.id}-answer-${idx}`,
            type: "voice",
            role: "customer",
            text: answer.answer || "",
            timestamp: answer.captured_at || log.created_at,
            callSid: log.call_sid,
          });
        });

        // Add AI response
        if (log.ai_response) {
          messages.push({
            id: `${log.id}-ai-response`,
            type: "voice",
            role: "ai",
            agentName: "AI",
            text: log.ai_response,
            timestamp: log.created_at,
            callSid: log.call_sid,
          });
        }
      }
    }

    // Sort messages by timestamp
    messages.sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    const transcript: CustomerTranscript = {
      customerId: resolvedCustomerId,
      customerName,
      customerPhone,
      customerEmail,
      messages,
      totalCalls: (callSessions?.length || 0) + (receptionistLogs?.length || 0),
      totalMessages: messages.length,
    };

    return NextResponse.json(transcript);
  } catch (error: any) {
    console.error("Error fetching transcript:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





