// app/api/dante/nudge/route.ts
//
// Nudge the authenticated user when Dante needs input and they
// haven't responded. Two modes:
//
//   1. schedule=true (default): writes a pending nudge to fire in
//      5 minutes. The cron tick sweeps pending nudges and delivers
//      them server-side — this survives page navigation and app
//      close, which the old client-side setTimeout did not.
//
//   2. schedule=false: fires immediately (SMS/email). Kept for
//      backwards compat and the cron sweep handler.
//
// Rate-limited to one nudge per chat to prevent spam.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const NUDGE_DELAY_MS = 5 * 60 * 1000; // 5 minutes

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
  const schedule = body.schedule !== false; // default true

  // Dedup: at most one nudge per chat_id to prevent repeat pings
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
    // Also check if a pending nudge already exists for this chat
    const { data: pending } = await supabaseAdmin
      .from("dante_pending_nudges")
      .select("id")
      .eq("chat_id", chatId)
      .limit(1)
      .maybeSingle();
    if (pending) {
      return NextResponse.json({ already_scheduled: true });
    }
  }

  // Look up the user's workspace
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // Schedule mode: write a pending nudge and let the cron tick fire it
  if (schedule) {
    const fireAt = new Date(Date.now() + NUDGE_DELAY_MS).toISOString();
    try {
      await supabaseAdmin.from("dante_pending_nudges").insert({
        workspace_id: profile.workspace_id,
        user_id: user.id,
        chat_id: chatId,
        question,
        workflow_name: workflowName,
        fire_at: fireAt,
      });
    } catch {
      // Table might not exist yet — fall through to immediate
      return await fireNudgeNow(user, profile.workspace_id, chatId, question, workflowName);
    }
    return NextResponse.json({ scheduled: true, fire_at: fireAt });
  }

  // Immediate mode
  return await fireNudgeNow(user, profile.workspace_id, chatId, question, workflowName);
}

// ── Immediate nudge delivery ──────────────────────────────────

async function fireNudgeNow(
  user: { id: string; email?: string },
  workspaceId: string,
  chatId: string | null,
  question: string,
  workflowName: string,
) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("sms_phone, sms_verified_at, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";
  const link = chatId ? `${appUrl}/dante/chat/${chatId}` : `${appUrl}/dante`;
  const messageBody =
    `Dante needs your input to configure "${workflowName}". ` +
    `Open Drift to continue: ${link}`;

  let channel: "sms" | "email" | "none" = "none";

  // Try SMS first (preferred -- immediate, personal)
  if (profile?.sms_phone && profile?.sms_verified_at) {
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
      await supabaseAdmin.from("dante_audit_log").insert({
        workspace_id: workspaceId,
        user_id: user.id,
        event_type: "nudge_sent",
        metadata: {
          dedup_key: `nudge:${chatId}`,
          channel,
          workflow_name: workflowName,
        },
      });
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json({ sent: channel !== "none", channel });
}

