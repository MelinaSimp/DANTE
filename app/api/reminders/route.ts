// app/api/reminders/route.ts — list + create

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const VALID_STATUSES = ["draft", "scheduled", "sent", "cancelled", "failed"];

export async function GET(request: Request) {
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
  if (!profile?.workspace_id) return NextResponse.json([]);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let q = supabase
    .from("reminders")
    .select(
      "id, source, contact_id, property_id, appointment_id, channel, to_email, subject, body, send_at, status, sent_at, send_error, reason, created_at, updated_at"
    )
    .eq("workspace_id", profile.workspace_id)
    .order("send_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (status && VALID_STATUSES.includes(status)) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    console.error("reminders GET:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
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

  const body = await request.json();
  const insert: Record<string, unknown> = {
    workspace_id: profile.workspace_id,
    created_by: user.id,
    source: body.source === "auto" ? "auto" : "user",
    contact_id: body.contact_id || null,
    property_id: body.property_id || null,
    appointment_id: body.appointment_id || null,
    channel: "email",
    to_email: body.to_email || null,
    subject: body.subject || null,
    body: body.body || null,
    send_at: body.send_at || null,
    status: "draft",
    reason: body.reason || null,
  };

  const { data, error } = await supabase
    .from("reminders")
    .insert(insert)
    .select()
    .single();
  if (error) {
    console.error("reminders POST:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
