// Issue a signed upload URL so the browser can PUT the audio blob directly
// to Supabase Storage — bypasses the Vercel 4.5 MB serverless payload cap.
// Also creates the `call_recordings` row in `uploading` status so we can
// track the lifecycle.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const contactId = typeof body.contactId === "string" ? body.contactId : "";
  if (!contactId) {
    return NextResponse.json({ error: "contactId required" }, { status: 400 });
  }

  // Resolve workspace via the contact (RLS ensures the caller owns it).
  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("id, workspace_id")
    .eq("id", contactId)
    .maybeSingle();
  if (contactErr || !contact?.workspace_id) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Create the call_recordings row up front so the client can reference it
  // and we can observe orphaned uploads.
  const { data: rec, error: recErr } = await supabaseAdmin
    .from("call_recordings")
    .insert({
      workspace_id: contact.workspace_id,
      contact_id: contactId,
      user_id: user.id,
      source: "browser",
      status: "uploading",
    })
    .select("id")
    .single();
  if (recErr || !rec) {
    return NextResponse.json(
      { error: recErr?.message || "Failed to create recording row" },
      { status: 500 }
    );
  }

  const path = `${contact.workspace_id}/${rec.id}.webm`;

  // createSignedUploadUrl returns a one-shot URL + token valid for a few hours.
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from("call-recordings")
    .createSignedUploadUrl(path);
  if (signErr || !signed) {
    return NextResponse.json(
      { error: signErr?.message || "Failed to sign upload URL" },
      { status: 500 }
    );
  }

  // Persist the storage path now so /api/calls/process can find it even
  // if the client never reports back.
  await supabaseAdmin
    .from("call_recordings")
    .update({ storage_path: path })
    .eq("id", rec.id);

  return NextResponse.json({
    recordingId: rec.id,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
  });
}
