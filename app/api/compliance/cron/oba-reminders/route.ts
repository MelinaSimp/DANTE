// Daily cron — OBA attestation reminders.
//
// SEC/FINRA expect annual attestation on every disclosed Outside
// Business Activity. CCO has it on /compliance, but advisors don't
// look there proactively. This cron emails the advisor 30 days,
// 14 days, and 1 day before next_attestation_due, then again on
// the day it's overdue.
//
// Wired in vercel.json at "0 11 * * *" (daily 11:00 UTC).

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ObaRow = {
  id: string;
  workspace_id: string;
  advisor_id: string | null;
  advisor_name: string;
  activity_name: string;
  next_attestation_due: string;
};

type Profile = {
  id: string;
  email: string | null;
  name: string | null;
};

const REMINDER_WINDOWS = [30, 14, 1, 0, -7] as const; // days from due

function daysUntil(dateStr: string, now = new Date()): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const ms = d.getTime() - now.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

async function handle(request: NextRequest) {
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;
  if (secret && bearer !== secret && url.searchParams.get("key") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Pull active OBAs whose attestation is due within the widest
  // reminder window (30 days from now) or already overdue (up to 7 days).
  const today = new Date();
  const windowStart = new Date(today.getTime() + -7 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(today.getTime() + 35 * 24 * 60 * 60 * 1000);

  const { data: rows, error } = await supabaseAdmin
    .from("compliance_oba_records")
    .select(
      "id, workspace_id, advisor_id, advisor_name, activity_name, next_attestation_due"
    )
    .eq("disclosure_status", "active")
    .gte("next_attestation_due", windowStart.toISOString().slice(0, 10))
    .lte("next_attestation_due", windowEnd.toISOString().slice(0, 10));
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = ((rows || []) as ObaRow[]).filter((r) => {
    const days = daysUntil(r.next_attestation_due);
    return REMINDER_WINDOWS.includes(days as any);
  });

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, scanned: rows?.length || 0, sent: 0 });
  }

  // Resolve advisor emails
  const advisorIds = Array.from(
    new Set(candidates.map((c) => c.advisor_id).filter((x): x is string => !!x))
  );
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, email, name")
    .in("id", advisorIds);
  const profileMap = new Map<string, Profile>(
    (profiles || []).map((p: any) => [p.id, p as Profile])
  );

  const resendKey = process.env.RESEND_API_KEY;
  const fromAddress =
    process.env.OBA_REMINDER_FROM ||
    process.env.RESEND_FROM ||
    "compliance@driftai.studio";
  const resend = resendKey ? new Resend(resendKey) : null;

  let sent = 0;
  let skipped = 0;

  for (const r of candidates) {
    const days = daysUntil(r.next_attestation_due);
    const profile = r.advisor_id ? profileMap.get(r.advisor_id) : undefined;
    const recipient = profile?.email;
    if (!recipient) {
      skipped += 1;
      continue;
    }

    const subject =
      days < 0
        ? `Overdue: re-attest your OBA — ${r.activity_name}`
        : days === 0
        ? `Today: re-attest your OBA — ${r.activity_name}`
        : `Re-attest your OBA in ${days} day${days === 1 ? "" : "s"} — ${r.activity_name}`;

    const body = `Hi ${profile?.name || r.advisor_name},

Your annual attestation for the following Outside Business Activity is ${
      days < 0
        ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
        : days === 0
        ? "due today"
        : `due in ${days} day${days === 1 ? "" : "s"}`
    }:

  Activity:    ${r.activity_name}
  Due date:    ${r.next_attestation_due}

Confirm the activity is still accurate (compensation, hours, scope) and re-attest in the Compliance dashboard:

  https://driftai.studio/compliance

— Drift compliance reminders
`;

    if (!resend) {
      console.log(`[oba-cron] dry-run (no RESEND_API_KEY): would email ${recipient} — ${subject}`);
      sent += 1;
      continue;
    }

    try {
      await resend.emails.send({
        from: fromAddress,
        to: recipient,
        subject,
        text: body,
      });
      sent += 1;
      await logAuditEvent({
        action: "compliance.oba.reminder_sent",
        workspaceId: r.workspace_id,
        actorKind: "cron",
        actorLabel: "oba-reminders",
        entityType: "compliance_oba_records",
        entityId: r.id,
        metadata: { days_until_due: days, recipient },
      }).catch(() => {});
    } catch (err: any) {
      console.error("[oba-cron] send failed:", err?.message);
      skipped += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: rows?.length || 0,
    sent,
    skipped,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}
