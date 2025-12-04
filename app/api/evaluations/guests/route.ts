// app/api/evaluations/guests/route.ts
// API endpoint to fetch customer conversations for Guests inbox

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { determineCustomerStatus } from "@/lib/customers";

export interface GuestConversation {
  customerId: string; // contact_id or phone number
  customerName: string | null;
  customerPhone: string;
  customerEmail: string | null;
  status: "inquiry" | "current" | "past";
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  responseBy: "AI" | string | null; // "AI" or agent name
  totalInteractions: number;
  hasUnread: boolean;
}

export async function GET(req: Request) {
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

    // Get all contacts in workspace
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, phone, email")
      .eq("workspace_id", workspaceId);

    // Get all call sessions (GigaAI agents)
    const { data: callSessions } = await supabase
      .from("call_sessions")
      .select("id, from_number, to_number, transcript, created_at, updated_at, agent_id")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    // Get all receptionist call logs
    const { data: receptionistLogs } = await supabase
      .from("receptionist_call_logs")
      .select("id, from_number, to_number, answers, ai_response, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    // Get appointments to determine customer status
    const { data: appointments } = await supabase
      .from("appointments")
      .select("contact_id, status, scheduled_at")
      .eq("workspace_id", workspaceId);

    // Group conversations by customer (phone number)
    const conversationsMap = new Map<string, GuestConversation>();

    // Process call sessions
    if (callSessions) {
      for (const session of callSessions) {
        const phone = session.from_number;
        if (!phone) continue;

        // Find contact by phone
        const contact = contacts?.find(c => c.phone === phone);
        const customerId = contact?.id || phone;
        const customerName = contact?.name || null;
        const customerEmail = contact?.email || null;

        // Get last message from transcript
        const transcript = Array.isArray(session.transcript) ? session.transcript : [];
        const lastMessage = transcript[transcript.length - 1];
        const lastMessagePreview = lastMessage?.text || lastMessage?.message || null;
        const lastMessageAt = session.updated_at || session.created_at;

        // Determine if AI or agent responded (for now, assume AI for call sessions)
        const responseBy: "AI" | string | null = "AI";

        const existing = conversationsMap.get(phone);
        if (!existing || new Date(lastMessageAt) > new Date(existing.lastMessageAt || "")) {
          conversationsMap.set(phone, {
            customerId,
            customerName,
            customerPhone: phone,
            customerEmail,
            status: "inquiry", // Will calculate below
            lastMessagePreview,
            lastMessageAt,
            responseBy,
            totalInteractions: (existing?.totalInteractions || 0) + 1,
            hasUnread: false, // TODO: Implement unread tracking
          });
        } else {
          existing.totalInteractions = (existing.totalInteractions || 0) + 1;
        }
      }
    }

    // Process receptionist logs
    if (receptionistLogs) {
      for (const log of receptionistLogs) {
        const phone = log.from_number;
        if (!phone) continue;

        const contact = contacts?.find(c => c.phone === phone);
        const customerId = contact?.id || phone;
        const customerName = contact?.name || null;
        const customerEmail = contact?.email || null;

        // Get last message from answers or ai_response
        const answers = Array.isArray(log.answers) ? log.answers : [];
        const lastAnswer = answers[answers.length - 1];
        const lastMessagePreview = log.ai_response || lastAnswer?.answer || null;
        const lastMessageAt = log.created_at;

        const responseBy: "AI" | string | null = "AI";

        const existing = conversationsMap.get(phone);
        if (!existing || new Date(lastMessageAt) > new Date(existing.lastMessageAt || "")) {
          conversationsMap.set(phone, {
            customerId,
            customerName,
            customerPhone: phone,
            customerEmail,
            status: "inquiry",
            lastMessagePreview,
            lastMessageAt,
            responseBy,
            totalInteractions: (existing?.totalInteractions || 0) + 1,
            hasUnread: false,
          });
        } else {
          existing.totalInteractions = (existing.totalInteractions || 0) + 1;
        }
      }
    }

    // Calculate customer status for each conversation
    const conversations = Array.from(conversationsMap.values()).map(conv => {
      const customerAppointments = appointments?.filter(a => {
        const contact = contacts?.find(c => c.id === conv.customerId);
        return contact && a.contact_id === contact.id;
      }) || [];

      const hasActiveBooking = customerAppointments.some(a => 
        a.status === "scheduled" || a.status === "confirmed"
      );
      const hasCompletedBooking = customerAppointments.some(a => 
        a.status === "completed"
      );

      const firstInteraction = conv.lastMessageAt; // Simplified - should track first interaction
      const status = determineCustomerStatus(
        firstInteraction || new Date().toISOString(),
        conv.lastMessageAt,
        hasActiveBooking,
        hasCompletedBooking
      );

      return {
        ...conv,
        status,
      };
    });

    // Sort by last message time (most recent first)
    conversations.sort((a, b) => {
      const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return timeB - timeA;
    });

    return NextResponse.json(conversations);
  } catch (error: any) {
    console.error("Error fetching guests:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}



