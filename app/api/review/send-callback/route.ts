// app/api/review/send-callback/route.ts
//
// POST callback invoked by the review queue when a supervisor
// approves a queued client-facing artifact. The queue handler
// (app/api/review/route.ts POST) calls this route with the
// review_item_id + whatever the producer packed in
// send_callback_data.
//
// Supported kinds:
//   - sms: sends via SendBlue (lib/sms/sender.ts)
//   - email: sends via Resend
//
// Auth: CRON_SECRET bearer token (internal callback, not user-facing).

import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/sms/sender";

export const dynamic = "force-dynamic";

interface CallbackBody {
  review_item_id: string;
  kind: string;
  // SMS fields
  to_phone?: string;
  body?: string;
  // Email fields
  to_email?: string;
  subject?: string;
  html?: string;
  text?: string;
  // Context
  workspace_id?: string;
  user_id?: string;
  contact_id?: string;
}

export async function POST(req: Request) {
  // Authenticate: only the review queue handler should call this
  const authHeader = req.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected || !authHeader.startsWith("Bearer ") || authHeader.slice(7) !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await req.json()) as CallbackBody;

  if (!payload.kind) {
    return NextResponse.json({ error: "kind is required" }, { status: 400 });
  }

  // ── SMS dispatch ─────────────────────────────────────────────
  if (payload.kind === "sms" || payload.kind === "reminder.sms") {
    if (!payload.to_phone || !payload.body) {
      return NextResponse.json(
        { error: "sms callback requires to_phone and body" },
        { status: 400 },
      );
    }
    try {
      const result = await sendMessage(payload.to_phone, payload.body, {
        workspaceId: payload.workspace_id,
        userId: payload.user_id,
        source: "review_queue_approved",
      });
      return NextResponse.json({
        ok: true,
        delivery_channel: result.delivery_channel,
        message_id: result.message_id,
        segments: result.segments,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `SMS send failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 },
      );
    }
  }

  // ── Email dispatch ───────────────────────────────────────────
  if (payload.kind === "email") {
    if (!payload.to_email || !payload.subject) {
      return NextResponse.json(
        { error: "email callback requires to_email and subject" },
        { status: 400 },
      );
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY not configured" },
        { status: 500 },
      );
    }
    const from = process.env.RESEND_FROM_EMAIL || "noreply@driftai.studio";
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: payload.to_email,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { error: json?.message || `Resend ${res.status}` },
          { status: 502 },
        );
      }
      return NextResponse.json({ ok: true, email_id: json.id });
    } catch (err) {
      return NextResponse.json(
        { error: `Email send failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    { error: `Unknown callback kind: ${payload.kind}` },
    { status: 400 },
  );
}
