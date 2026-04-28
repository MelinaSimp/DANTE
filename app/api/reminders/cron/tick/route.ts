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

// Document expiry scan — runs once per UTC hour like the appointment
// scan. Looks 60 days ahead at property_documents.expires_at, dedupes
// against existing auto reminders by property_document_id, and drops
// a draft reminder per doc using a sensible templated body. The user
// reviews + schedules from the Reminders surface.
//
// Why 60 days: leases and insurance often need 30-day notice; we
// build in a buffer so the agent / advisor sees it twice (initial
// draft, then a follow-up after they review).
async function scanDocumentExpiries(): Promise<{ proposed_doc_renewals: number }> {
  const now = new Date();
  if (now.getUTCMinutes() !== 0) return { proposed_doc_renewals: 0 };

  const horizon = new Date(now.getTime() + 60 * 86400_000);
  const horizonDate = horizon.toISOString().slice(0, 10);
  const todayDate = now.toISOString().slice(0, 10);

  const { data: docs } = await supabaseAdmin
    .from("property_documents")
    .select("id, workspace_id, property_id, title, doc_kind, expires_at")
    .gte("expires_at", todayDate)
    .lte("expires_at", horizonDate);

  if (!docs || docs.length === 0) return { proposed_doc_renewals: 0 };

  const docIds = docs.map((d: any) => d.id);
  const { data: existing } = await supabaseAdmin
    .from("reminders")
    .select("property_document_id")
    .eq("source", "auto")
    .in("property_document_id", docIds);
  const seen = new Set(
    (existing || [])
      .map((r: any) => r.property_document_id)
      .filter((v: string | null) => Boolean(v)),
  );

  const proposals: any[] = [];
  for (const d of docs) {
    if (seen.has(d.id)) continue;

    // Find a contactable person for this property. Preference order:
    //   1. landlord (for leases, HOA, insurance)
    //   2. seller (for disclosures, deed)
    //   3. tenant (for lease-end notice to renewing tenant)
    //   4. any linked contact with an email
    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select("address_line1, city, tenant_contact_id")
      .eq("id", d.property_id)
      .maybeSingle();
    if (!prop) continue;

    const { data: links } = await supabaseAdmin
      .from("property_clients")
      .select("contact_id, role")
      .eq("property_id", d.property_id);

    const PREF: Record<string, string[]> = {
      lease: ["landlord", "tenant", "seller", "buyer"],
      insurance: ["landlord", "seller", "buyer"],
      hoa: ["landlord", "seller", "buyer"],
      inspection: ["seller", "buyer", "landlord"],
      disclosure: ["seller", "buyer"],
      deed: ["seller", "buyer"],
      comp: ["seller", "buyer"],
      photo: ["seller", "landlord"],
      other: ["landlord", "seller", "buyer", "tenant"],
    };
    const order = PREF[d.doc_kind] || PREF.other;

    let pickedContactId: string | null = null;
    for (const role of order) {
      const match = (links || []).find((l: any) => l.role === role);
      if (match) {
        pickedContactId = match.contact_id;
        break;
      }
    }
    if (!pickedContactId && prop.tenant_contact_id) {
      pickedContactId = prop.tenant_contact_id;
    }
    if (!pickedContactId && links && links.length > 0) {
      pickedContactId = links[0].contact_id;
    }

    let toEmail: string | null = null;
    let contactName: string | null = null;
    if (pickedContactId) {
      const { data: c } = await supabaseAdmin
        .from("contacts")
        .select("name, email")
        .eq("id", pickedContactId)
        .maybeSingle();
      if (c) {
        contactName = c.name ?? null;
        toEmail = c.email ?? null;
      }
    }

    // Schedule the draft to fire 30 days before expiry, but never in
    // the past (clamp to now+1h so it's pickable in the UI).
    const expiryMs = new Date(d.expires_at).getTime();
    const sendAtMs = Math.max(
      expiryMs - 30 * 86400_000,
      now.getTime() + 3600_000,
    );
    const sendAt = new Date(sendAtMs).toISOString();
    const expiryHuman = new Date(d.expires_at).toLocaleDateString("en-US", {
      dateStyle: "long",
    });

    const addr = [prop.address_line1, prop.city].filter(Boolean).join(", ");
    const KIND_HUMAN: Record<string, string> = {
      lease: "lease",
      insurance: "insurance policy",
      hoa: "HOA documentation",
      inspection: "inspection report",
      disclosure: "disclosure",
      deed: "deed",
      comp: "comp",
      photo: "photo",
      other: "document",
    };
    const kindHuman = KIND_HUMAN[d.doc_kind] || "document";

    proposals.push({
      workspace_id: d.workspace_id,
      source: "auto",
      contact_id: pickedContactId,
      property_id: d.property_id,
      property_document_id: d.id,
      channel: "email",
      to_email: toEmail,
      subject: `Heads up: ${kindHuman} for ${addr || d.title} expires ${expiryHuman}`,
      body:
        `Hi${contactName ? ` ${contactName.split(" ")[0]}` : ""},\n\n` +
        `Quick reminder that the ${kindHuman} we have on file for ` +
        `${addr || "your property"} ("${d.title}") expires on ${expiryHuman}.\n\n` +
        `I'd like to get the renewal underway with plenty of runway. ` +
        `Let me know a good time this week to review and I'll send the ` +
        `next steps over.\n\n` +
        `Thanks.`,
      send_at: sendAt,
      reason:
        `Auto-proposed: ${kindHuman} on property ${d.property_id} expires ${d.expires_at}.`,
      status: "draft",
    });
  }

  if (proposals.length > 0) {
    await supabaseAdmin.from("reminders").insert(proposals);
  }
  return { proposed_doc_renewals: proposals.length };
}

async function handle(request: Request) {
  if (!authOk(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [scanRes, docScanRes, sendRes] = await Promise.all([
    scan(),
    scanDocumentExpiries(),
    sendDue(),
  ]);
  return NextResponse.json({ ok: true, ...scanRes, ...docScanRes, ...sendRes });
}

export const GET = handle;
export const POST = handle;
