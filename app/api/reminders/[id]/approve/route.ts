// app/api/reminders/[id]/approve/route.ts
//
// User approves a draft → moves it to status='scheduled' so the cron
// can pick it up and send. Validates that the draft has the minimum
// pieces a Resend send needs (to_email, subject, body, send_at).

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit/log";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const { id } = await params;

  // Optional override of send_at on approve.
  const body = await request.json().catch(() => ({}));
  const sendAtOverride: string | undefined = body.send_at;

  const { data: reminder } = await supabase
    .from("reminders")
    .select("to_email, subject, body, send_at, status")
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (reminder.status !== "draft") {
    return NextResponse.json(
      { error: `Already ${reminder.status}` },
      { status: 400 }
    );
  }

  const finalSendAt = sendAtOverride || reminder.send_at;
  if (!reminder.to_email) {
    return NextResponse.json({ error: "to_email required" }, { status: 400 });
  }
  if (!reminder.subject || !reminder.body) {
    return NextResponse.json(
      { error: "Subject and body required" },
      { status: 400 }
    );
  }
  if (!finalSendAt) {
    return NextResponse.json({ error: "send_at required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("reminders")
    .update({ status: "scheduled", send_at: finalSendAt })
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAuditEvent({
    workspaceId: profile.workspace_id,
    actorUserId: user.id,
    actorKind: "user",
    action: "reminder.approve",
    entityType: "reminder",
    entityId: id,
    metadata: {
      subject: reminder.subject,
      send_at: finalSendAt,
      to_email: reminder.to_email,
    },
    request,
  });

  return NextResponse.json(data);
}
