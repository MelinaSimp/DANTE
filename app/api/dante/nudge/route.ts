// app/api/dante/nudge/route.ts
//
// Nudge the authenticated user when Dante needs input and they
// haven't responded. Sends an SMS (iMessage when possible) to
// the user's enrolled phone number. Falls back to email if no
// phone is on file.
//
// Called by the client-side NeedsInputCard after a 5-minute idle
// timeout. Rate-limited to one nudge per chat to prevent spam.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question : "";
  const workflowName =
    typeof body.workflow_name === "string" ? body.workflow_name : "a workflow";
  const chatId = typeof body.chat_id === "string" ? body.chat_id : null;

  // Dedup: at most one nudge per chat_id to prevent repeat pings
  // if the timer fires multiple times (e.g. component re-mounts).
  if (chatId) {
    const dedup = `nudge:${chatId}`;
    const { data: existing } = await supabaseAdmin
      .from("dante_audit_log")
      .select("id")
      .eq("event_type", "nudge_sent")
      .eq("metadata->>dedup_key", dedup)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ already_sent: true });
    }
  }

  // Look up the user's phone and workspace
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("workspace_id, sms_phone, sms_verified_at, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";
  const link = chatId ? `${appUrl}/dante/chat/${chatId}` : `${appUrl}/dante`;
  const messageBody =
    `Dante needs your input to configure "${workflowName}". ` +
    `Open Drift to continue: ${link}`;

  let channel: "sms" | "email" | "none" = "none";

  // Try SMS first (preferred — immediate, personal)
  if (profile.sms_phone && profile.sms_verified_at) {
    try {
      const { sendMessage } = await import("@/lib/sms/sender");
      await sendMessage(profile.sms_phone, messageBody);
      channel = "sms";
    } catch (err) {
      console.warn("[nudge] SMS failed, falling back to email:", err);
    }
  }

  // Fall back to email if SMS unavailable or failed
  if (channel === "none") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || "Drift <noreply@driftai.studio>";
    if (apiKey && user.email) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: user.email,
            subject: `Dante needs your input -- ${workflowName}`,
            text: messageBody,
          }),
        });
        channel = "email";
      } catch (err) {
        console.warn("[nudge] Email also failed:", err);
      }
    }
  }

  // Audit log for dedup + observability
  if (chatId && channel !== "none") {
    try {
      await supabaseAdmin
        .from("dante_audit_log")
        .insert({
          workspace_id: profile.workspace_id,
          user_id: user.id,
          event_type: "nudge_sent",
          metadata: {
            dedup_key: `nudge:${chatId}`,
            channel,
            workflow_name: workflowName,
          },
        });
    } catch {
      // Non-fatal — dedup is best-effort; table may not exist yet.
    }
  }

  return NextResponse.json({ sent: channel !== "none", channel });
}
