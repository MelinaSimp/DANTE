// app/api/evaluations/data/route.ts
// API endpoint to fetch overall company analytics

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export interface CompanyAnalytics {
  totalConversations: number;
  totalCalls: number;
  totalMessages: number;
  activeCustomers: {
    inquiry: number;
    current: number;
    past: number;
  };
  responseMetrics: {
    averageResponseTime: number; // in seconds
    aiResponseRatio: number; // percentage
    humanResponseRatio: number; // percentage
  };
  callMetrics: {
    totalCalls: number;
    averageDuration: number; // in seconds
    successRate: number; // percentage
  };
  peakActivity: {
    busiestHour: number; // 0-23
    busiestDay: string; // day name
  };
  aiPerformance: {
    handledByAI: number; // percentage
    escalationRate: number; // percentage
  };
  customerGrowth: {
    newCustomersLast7Days: number;
    newCustomersLast30Days: number;
  };
  commonTopics: Array<{
    topic: string;
    count: number;
  }>;
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

    // Get all call sessions
    const { data: callSessions } = await supabase
      .from("call_sessions")
      .select("id, created_at, transcript")
      .eq("workspace_id", workspaceId);

    // Get all receptionist logs
    const { data: receptionistLogs } = await supabase
      .from("receptionist_call_logs")
      .select("id, created_at, answers, ai_response")
      .eq("workspace_id", workspaceId);

    // Get contacts for customer counts
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, created_at")
      .eq("workspace_id", workspaceId);

    // Get appointments for status calculation
    const { data: appointments } = await supabase
      .from("appointments")
      .select("contact_id, status, created_at")
      .eq("workspace_id", workspaceId);

    const totalCalls = (callSessions?.length || 0) + (receptionistLogs?.length || 0);
    const totalMessages = callSessions?.reduce((sum, s) => {
      const transcript = Array.isArray(s.transcript) ? s.transcript : [];
      return sum + transcript.length;
    }, 0) || 0;

    // Calculate customer status counts (simplified)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const newCustomersLast7Days = contacts?.filter(c => 
      new Date(c.created_at) >= sevenDaysAgo
    ).length || 0;
    const newCustomersLast30Days = contacts?.filter(c => 
      new Date(c.created_at) >= thirtyDaysAgo
    ).length || 0;

    // Calculate peak activity (simplified - would need more detailed tracking)
    const hourCounts = new Array(24).fill(0);
    const dayCounts: Record<string, number> = {};

    callSessions?.forEach(session => {
      const date = new Date(session.created_at);
      hourCounts[date.getHours()]++;
      const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
      dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
    });

    const busiestHour = hourCounts.indexOf(Math.max(...hourCounts));
    const busiestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Monday";

    // Calculate AI performance (simplified - assume all are AI for now)
    const aiHandled = totalCalls; // All calls are AI for now
    const aiHandledPercentage = totalCalls > 0 ? (aiHandled / totalCalls) * 100 : 0;

    const analytics: CompanyAnalytics = {
      totalConversations: totalCalls,
      totalCalls,
      totalMessages,
      activeCustomers: {
        inquiry: contacts?.length || 0, // Simplified
        current: contacts?.filter(c => {
          const contactAppointments = appointments?.filter(a => a.contact_id === c.id) || [];
          return contactAppointments.some(a => a.status === "scheduled" || a.status === "confirmed");
        }).length || 0,
        past: contacts?.filter(c => {
          const contactAppointments = appointments?.filter(a => a.contact_id === c.id) || [];
          return contactAppointments.some(a => a.status === "completed");
        }).length || 0,
      },
      responseMetrics: {
        averageResponseTime: 0, // Would need response time tracking
        aiResponseRatio: 100, // All AI for now
        humanResponseRatio: 0,
      },
      callMetrics: {
        totalCalls,
        averageDuration: 0, // Would need duration tracking
        successRate: 100, // Simplified
      },
      peakActivity: {
        busiestHour,
        busiestDay,
      },
      aiPerformance: {
        handledByAI: aiHandledPercentage,
        escalationRate: 0, // Would need escalation tracking
      },
      customerGrowth: {
        newCustomersLast7Days,
        newCustomersLast30Days,
      },
      commonTopics: [], // Would need topic extraction
    };

    return NextResponse.json(analytics);
  } catch (error: any) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}




