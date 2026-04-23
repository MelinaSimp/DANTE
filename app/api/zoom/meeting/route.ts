// POST /api/zoom/meeting
// Body: { contactId: string }
//
// Creates an instant Zoom meeting (cloud recording forced on) on the
// workspace's connected Zoom account, then inserts a `call_recordings`
// row tied to the contact so we can match the webhook later.
//
// Returns start_url (advisor clicks this to host) + join_url.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireActiveBilling } from "@/lib/billing/gate";
import { createInstantMeeting } from "@/lib/zoom/client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const gate = await requireActiveBilling(profile.workspace_id);
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const contactId = typeof body?.contactId === "string" ? body.contactId : "";
  if (!contactId) {
    return NextResponse.json({ error: "contactId required" }, { status: 400 });
  }

  // RLS-backed: caller must be able to see the contact.
  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("id, name, workspace_id")
    .eq("id", contactId)
    .maybeSingle();
  if (contactErr || !contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  if (contact.workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Confirm Zoom is connected before we try to call it.
  const { data: creds } = await supabaseAdmin
    .from("zoom_credentials")
    .select("workspace_id")
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!creds) {
    return NextResponse.json(
      {
        error:
          "Zoom isn't connected yet. Go to Settings → Integrations → Zoom to connect your account.",
      },
      { status: 400 }
    );
  }

  let meeting: Awaited<ReturnType<typeof createInstantMeeting>>;
  try {
    meeting = await createInstantMeeting(
      profile.workspace_id,
      `Drift call with ${contact.name || "client"}`
    );
  } catch (err: any) {
    console.error("[zoom/meeting] create failed:", err);
    return NextResponse.json(
      { error: `Zoom meeting create failed: ${err?.message || "unknown"}` },
      { status: 502 }
    );
  }

  const { data: rec, error: recErr } = await supabaseAdmin
    .from("call_recordings")
    .insert({
      workspace_id: profile.workspace_id,
      contact_id: contactId,
      user_id: user.id,
      source: "zoom",
      status: "scheduled",
      zoom_meeting_id: String(meeting.id),
      zoom_meeting_uuid: meeting.uuid,
      zoom_join_url: meeting.join_url,
      zoom_start_url: meeting.start_url,
    })
    .select("id")
    .single();

  if (recErr) {
    console.error("[zoom/meeting] recording insert failed:", recErr);
    return NextResponse.json(
      { error: `Failed to register recording: ${recErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    recordingId: rec.id,
    meetingId: meeting.id,
    startUrl: meeting.start_url,
    joinUrl: meeting.join_url,
    password: meeting.password ?? null,
  });
}
