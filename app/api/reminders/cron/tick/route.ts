// app/api/reminders/cron/tick/route.ts
//
// Combined cron handler — runs every minute (or whatever cadence the
// Vercel cron config wires). Two passes:
//
//   1. SCAN — once per UTC hour, look for upcoming appointments in
//      the next 7 days that don't already have an auto-reminder.
//      Drop a draft so the user gets a daily digest of "things you
//      should remind yourself about." Idempotent — keyed by
//      (appointment_id, source='auto') so re-running won't duplicate.
//
//   2. SEND — every tick, sweep reminders where status='scheduled'
//      and send_at <= now(), fire via Resend, mark sent (or failed
//      with the error captured for the user to see).
//
// Auth: Authorization: Bearer <CRON_SECRET> (or ?key=). Set
// CRON_SECRET in env, configure Vercel Cron in vercel.json.

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authOk(request: Request) {
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: open
  return bearer === secret || url.searchParams.get("key") === secret;
}

async function scan(): Promise<{ proposed: number }> {
  // Only run the scan pass once per hour to keep token cost down.
  const now = new Date();
  if (now.getUTCMinutes() !== 0) return { proposed: 0 };

  const horizon = new Date(now.getTime() + 7 * 86400_000).toISOString();
  const { data: appts } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, workspace_id, scheduled_at, service_type, contact_id, caller_name, caller_phone"
    )
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", horizon);

  if (!appts || appts.length === 0) return { proposed: 0 };

  // Existing auto-reminders we already proposed for these appointments.
  const apptIds = appts.map((a: any) => a.id);
  const { data: existing } = await supabaseAdmin
    .from("reminders")
    .select("appointment_id")
    .eq("source", "auto")
    .in("appointment_id", apptIds);
  const seen = new Set((existing || []).map((r: any) => r.appointment_id));

  const proposals: any[] = [];
  for (const a of appts) {
    if (seen.has(a.id)) continue;

    // Pull contact email if linked.
    let toEmail: string | null = null;
    let contactName: string | null = a.caller_name ?? null;
    if (a.contact_id) {
      const { data: c } = await supabaseAdmin
        .from("contacts")
        .select("name, email")
        .eq("id", a.contact_id)
        .maybeSingle();
      if (c) {
        contactName = c.name ?? contactName;
        toEmail = c.email ?? null;
      }
    }
    if (!toEmail) continue; // can't send a reminder without an email

    // Send 24h before the appointment, capped at "now + 1h" for
    // appointments that are already inside the 24h window.
    const sendAt = new Date(
      Math.max(
        new Date(a.scheduled_at).getTime() - 24 * 3600_000,
        now.getTime() + 3600_000
      )
    ).toISOString();

    const apptLocal = new Date(a.scheduled_at).toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });

    proposals.push({
      workspace_id: a.workspace_id,
      source: "auto",
      contact_id: a.contact_id ?? null,
      appointment_id: a.id,
      channel: "email",
      to_email: toEmail,
      subject: `Reminder: ${a.service_type || "Our meeting"} on ${apptLocal}`,
      body:
        `Hi${contactName ? ` ${contactName.split(" ")[0]}` : ""},\n\n` +
        `Just a friendly reminder we're scheduled for ${apptLocal}.\n\n` +
        `Let me know if anything changes — happy to reschedule if needed.\n\n` +
        `Talk soon.`,
      send_at: sendAt,
      reason: `Auto-proposed from upcoming appointment ${a.id}.`,
      status: "draft",
    });
  }

  if (proposals.length > 0) {
    await supabaseAdmin.from("reminders").insert(proposals);
  }
  return { proposed: proposals.length };
}

async function sendDue(): Promise<{ sent: number; failed: number }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { sent: 0, failed: 0 };
  const resend = new Resend(resendKey);

  const nowIso = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from("reminders")
    .select("id, workspace_id, to_email, subject, body, channel")
    .eq("status", "scheduled")
    .lte("send_at", nowIso)
    .limit(50);

  if (!due || due.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const r of due) {
    if (r.channel !== "email") continue; // future channels not wired
    if (!r.to_email || !r.subject || !r.body) {
      await supabaseAdmin
        .from("reminders")
        .update({
          status: "failed",
          send_error: "Missing to_email / subject / body at send time",
        })
        .eq("id", r.id);
      failed++;
      continue;
    }

    try {
      const { error: sendErr } = await resend.emails.send({
        from: process.env.REMINDERS_FROM_EMAIL || "Drift <reminders@drift.ai>",
        to: r.to_email,
        subject: r.subject,
        text: r.body,
      });
      if (sendErr) throw new Error(sendErr.message);
      await supabaseAdmin
        .from("reminders")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          send_error: null,
        })
        .eq("id", r.id);
      sent++;
    } catch (e: any) {
      await supabaseAdmin
        .from("reminders")
        .update({ status: "failed", send_error: e.message || "send failed" })
        .eq("id", r.id);
      failed++;
    }
  }
  return { sent, failed };
}

async function handle(request: Request) {
  if (!authOk(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [scanRes, sendRes] = await Promise.all([scan(), sendDue()]);
  return NextResponse.json({ ok: true, ...scanRes, ...sendRes });
}

export const GET = handle;
export const POST = handle;
