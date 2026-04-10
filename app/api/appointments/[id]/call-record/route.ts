import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: appointment } = await supabaseAdmin
    .from("appointments")
    .select("id, contact_id, scheduled_at, contacts(phone)")
    .eq("id", id)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const phone = (appointment as any).contacts?.phone;
  if (!phone) {
    return NextResponse.json(null);
  }

  const scheduledAt = new Date(appointment.scheduled_at);
  const windowStart = new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(scheduledAt.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data: callLog } = await supabaseAdmin
    .from("outbound_call_logs")
    .select("recording_url, transcript, summary")
    .eq("phone_number", phone)
    .gte("created_at", windowStart)
    .lte("created_at", windowEnd)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!callLog) {
    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("recording_url, transcript, summary, ai_summary")
      .eq("caller_number", phone)
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (conversation) {
      return NextResponse.json({
        recording_url: conversation.recording_url || null,
        transcript: conversation.transcript || null,
        summary: conversation.summary || conversation.ai_summary || null,
      });
    }

    return NextResponse.json(null);
  }

  return NextResponse.json({
    recording_url: callLog.recording_url || null,
    transcript: callLog.transcript || null,
    summary: callLog.summary || null,
  });
}
