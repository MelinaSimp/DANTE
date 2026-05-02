// SendBlue inbound webhook.
//
// Flow:
//   1. Read raw body, verify HMAC signature
//   2. Parse incoming { phone, content, message_id, isFromMe }
//   3. Drop if isFromMe / empty
//   4. Dedup against sms_processed_messages
//   5. Resolve phone → user (profiles.sms_phone, must be verified)
//   6. Run slash command if applicable, OR run the SMS agent
//   7. Send the reply via SendBlue
//   8. Return 200 to SendBlue immediately (we ack first, work after)
//
// SendBlue retries on 5xx, so step 4 is critical.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifySendBlueSignature, sendMessage, sendTypingIndicator } from "@/lib/sms/sender";
import { handleCommand, isWithinQuietHours } from "@/lib/sms/commands";
import { runSmsAgent } from "@/lib/sms/agent";
import { getIndustryConfig } from "@/lib/industry/config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface SendBlueIncoming {
  phone: string | null;
  content: string;
  message_id: string | null;
  is_from_me: boolean;
}

function parseIncoming(body: any): SendBlueIncoming {
  // SendBlue payload shapes vary slightly between v1/v2; tolerate both.
  return {
    phone: body?.from_number || body?.number || body?.fromNumber || null,
    content: String(body?.content || body?.text || "").trim(),
    message_id: body?.message_uuid || body?.messageId || body?.message_id || null,
    is_from_me: body?.is_from_me === true || body?.fromMe === true,
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature =
    req.headers.get("sb-signing-secret") ||
    req.headers.get("x-sendblue-signature");
  if (!verifySendBlueSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const incoming = parseIncoming(payload);
  if (incoming.is_from_me || !incoming.phone || !incoming.content) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Dedup
  if (incoming.message_id) {
    const { data: prior } = await supabaseAdmin
      .from("sms_processed_messages")
      .select("message_id")
      .eq("message_id", incoming.message_id)
      .maybeSingle();
    if (prior) {
      return NextResponse.json({ ok: true, deduped: true });
    }
  }

  // Resolve phone → user. Must be verified.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, workspace_id, full_name, sms_verified_at, sms_quiet_start, sms_quiet_end, sms_timezone",
    )
    .eq("sms_phone", incoming.phone)
    .maybeSingle();

  if (!profile || !(profile as any).sms_verified_at) {
    // Unknown / unverified number — short reply, log nothing.
    await sendMessage(
      incoming.phone,
      "This number isn't connected to a Drift account yet. Add and verify your number in Drift → Settings → SMS.",
    ).catch(() => {});
    return NextResponse.json({ ok: true, unauthenticated: true });
  }

  const userId = (profile as any).id as string;
  const workspaceId = (profile as any).workspace_id as string;

  if (!workspaceId) {
    return NextResponse.json({ ok: true, unauthenticated: true });
  }

  // Mark dedup early
  if (incoming.message_id) {
    await supabaseAdmin.from("sms_processed_messages").insert({
      message_id: incoming.message_id,
      phone: incoming.phone,
      user_id: userId,
      workspace_id: workspaceId,
    });
  }

  // Resolve workspace branding info
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("name, industry")
    .eq("id", workspaceId)
    .maybeSingle();
  const industry = (ws as any)?.industry as string | null;
  const config = getIndustryConfig(industry);
  const assistantName = config.assistantName || "Dante";

  // Quiet hours — acknowledge but don't run the agent
  if (
    isWithinQuietHours(
      (profile as any).sms_quiet_start,
      (profile as any).sms_quiet_end,
    )
  ) {
    // Save the inbound so it's not lost; queue agent for after quiet hours.
    await supabaseAdmin.from("sms_messages").insert({
      workspace_id: workspaceId,
      user_id: userId,
      phone: incoming.phone,
      direction: "inbound",
      body: incoming.content,
      message_id: incoming.message_id,
      metadata: { queued_for_after_quiet: true },
    });
    return NextResponse.json({ ok: true, queued: true });
  }

  // Slash commands bypass the agent
  const cmd = await handleCommand(
    { userId, workspaceId, phone: incoming.phone },
    incoming.content,
  );
  if (cmd.handled) {
    if (cmd.reply === "__DIGEST__") {
      // /digest fires the briefing immediately. We send a tiny ack first
      // and then trigger the briefing route in the background.
      await sendMessage(incoming.phone, "Pulling your briefing…", {
        workspaceId,
        userId,
        source: "sms_command",
      }).catch(() => {});
      // Inline call to briefing generator
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio"}/api/sms/cron/briefing?user=${userId}`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${process.env.CRON_SECRET || ""}`,
            },
          },
        );
      } catch {
        // briefing is best-effort
      }
      return NextResponse.json({ ok: true, command: "digest" });
    }
    if (cmd.reply) {
      await sendMessage(incoming.phone, cmd.reply, {
        workspaceId,
        userId,
        source: "sms_command",
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, command: true });
  }

  // Real conversation — fire the agent
  // (typing indicator is best-effort; non-blocking)
  sendTypingIndicator(incoming.phone).catch(() => {});

  try {
    const result = await runSmsAgent({
      workspaceId,
      userId,
      phone: incoming.phone,
      body: incoming.content,
      industry,
      assistantName,
      userName: (profile as any).full_name || null,
      workspaceName: (ws as any)?.name || null,
      userTimezone: (profile as any).sms_timezone || "America/New_York",
    });
    await sendMessage(incoming.phone, result.reply, {
      workspaceId,
      userId,
      source: "sms_assistant",
    });
    return NextResponse.json({
      ok: true,
      agent_run_id: result.agentRunId,
      truncated: result.truncated,
    });
  } catch (err: any) {
    console.error("[sms.webhook] agent error:", err?.message);
    await sendMessage(
      incoming.phone,
      "Hit a snag — try again in a sec?",
    ).catch(() => {});
    return NextResponse.json({ ok: true, error: err?.message }, { status: 200 });
  }
}
