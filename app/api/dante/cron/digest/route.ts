// app/api/dante/cron/digest/route.ts
//
// Monday-morning "who to call this week" digest. Fires weekly via
// Vercel cron. For each workspace with at least one critical or
// act_now brief, we email every member of that workspace a short
// list (up to 5) of those briefs: contact name, headline, one
// grounded reason. One-click "Open in Drift" per row.
//
// This is the whole point of killing the scoreboard. The advisor
// doesn't want to log in and squint at a dashboard — they want
// Monday's call list to be waiting for them. The briefs already
// exist (generated lazily or via rank-my-book); this endpoint
// just distills them into an email.
//
// ── Auth ──
// Cron calls hit /api/dante/cron/digest with an Authorization:
// Bearer $CRON_SECRET header (mirrors the existing scheduled-emails
// cron). A manual GET with ?dryRun=true skips the Resend call and
// returns the rendered payload instead, for debugging.
//
// ── Dedup / state ──
// We do not store "last sent" state yet. A workspace's Monday 8am
// email will re-send the same briefs on the rare chance the cron
// runs twice. Resend will idempotency-handle at the provider level
// for a single request; cron itself shouldn't double-fire.
//
// ── Opt-out ──
// Not wired yet (v2). A profile or workspace flag will gate later.

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BRIEFS_PER_EMAIL = 5;
const FROM_DEFAULT = "Drift <noreply@driftai.studio>";
const RISK_ORDER: Record<string, number> = {
  critical: 0,
  act_now: 1,
  watch: 2,
  healthy: 3,
};

// Only these risk levels surface in the weekly digest. Watch /
// healthy are visible in the app but don't warrant a push.
const DIGEST_RISK_LEVELS = ["critical", "act_now"];

interface BriefRow {
  contact_id: string;
  workspace_id: string;
  risk_level: string;
  headline: string;
  reasons: Array<{
    text: string;
    source_table: string;
    source_id: string;
  }>;
  recommended_action: string | null;
}

interface ContactRow {
  id: string;
  name: string | null;
  email: string | null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  // Auth: cron uses bearer, manual dry-runs also need it so we don't
  // leak brief text publicly. Superadmin-only would be nicer but this
  // is internal infra; CRON_SECRET is fine for v1.
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey && !dryRun) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured" },
      { status: 500 }
    );
  }
  const fromEmail = process.env.RESEND_FROM_EMAIL || FROM_DEFAULT;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";

  // ── Pull all qualifying briefs in one shot, then group ──
  const { data: briefs, error } = await supabaseAdmin
    .from("dante_briefs")
    .select(
      "workspace_id, contact_id, risk_level, headline, reasons, recommended_action"
    )
    .in("risk_level", DIGEST_RISK_LEVELS);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!briefs || briefs.length === 0) {
    return NextResponse.json({
      workspaces_checked: 0,
      emails_sent: 0,
      emails_skipped: 0,
      note: "No critical/act_now briefs across any workspace",
    });
  }

  // Group briefs by workspace, sort by risk then by recommended_action
  // presence (briefs with a concrete action first — nudges advisor to
  // do something rather than just read).
  const byWorkspace = new Map<string, BriefRow[]>();
  for (const b of briefs as BriefRow[]) {
    const list = byWorkspace.get(b.workspace_id) || [];
    list.push(b);
    byWorkspace.set(b.workspace_id, list);
  }

  // Preload contact info in one query for speed.
  const allContactIds = briefs.map((b) => b.contact_id);
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, name, email")
    .in("id", allContactIds);
  const contactById = new Map<string, ContactRow>(
    (contacts || []).map((c) => [c.id, c as ContactRow])
  );

  // Preload workspace names.
  const workspaceIds = Array.from(byWorkspace.keys());
  const { data: workspaces } = await supabaseAdmin
    .from("workspaces")
    .select("id, name")
    .in("id", workspaceIds);
  const workspaceName = new Map<string, string>(
    (workspaces || []).map((w) => [w.id, w.name || "your workspace"])
  );

  const resend = resendKey ? new Resend(resendKey) : null;

  let emailsSent = 0;
  let emailsSkipped = 0;
  let emailsFailed = 0;
  const dryRunPayloads: Array<{
    to: string;
    subject: string;
    preview: string;
    brief_count: number;
  }> = [];

  for (const [workspace_id, rawList] of byWorkspace) {
    // Rank + truncate per workspace.
    const topBriefs = rawList
      .sort((a, b) => {
        const ra = RISK_ORDER[a.risk_level] ?? 99;
        const rb = RISK_ORDER[b.risk_level] ?? 99;
        if (ra !== rb) return ra - rb;
        // Prefer briefs with a concrete recommended action.
        const aHas = a.recommended_action ? 0 : 1;
        const bHas = b.recommended_action ? 0 : 1;
        return aHas - bHas;
      })
      .slice(0, MAX_BRIEFS_PER_EMAIL);

    if (topBriefs.length === 0) {
      emailsSkipped++;
      continue;
    }

    // Recipients: every profile in the workspace.
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("workspace_id", workspace_id);

    const profileIds = (profiles || []).map((p) => p.id);
    if (profileIds.length === 0) {
      emailsSkipped++;
      continue;
    }

    // Auth users carry the email. Resolve one by one — small fanout,
    // and the Supabase auth.admin listUsers API is paginated clumsily.
    const recipients: string[] = [];
    for (const id of profileIds) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        if (u?.user?.email) recipients.push(u.user.email);
      } catch {
        // Skip if we can't resolve — treat as no-recipient.
      }
    }
    if (recipients.length === 0) {
      emailsSkipped++;
      continue;
    }

    const wsName = workspaceName.get(workspace_id) || "your workspace";
    const subject = buildSubject(topBriefs);
    const { html, text } = renderDigest({
      workspaceName: wsName,
      briefs: topBriefs,
      contactById,
      appUrl,
    });

    if (dryRun) {
      dryRunPayloads.push({
        to: recipients.join(", "),
        subject,
        preview: text.slice(0, 300),
        brief_count: topBriefs.length,
      });
      continue;
    }

    if (!resend) {
      emailsFailed++;
      continue;
    }

    try {
      const { error: sendErr } = await resend.emails.send({
        from: fromEmail,
        to: recipients,
        subject,
        html,
        text,
      });
      if (sendErr) throw new Error(sendErr.message);
      emailsSent += recipients.length;
      console.log(
        `[dante digest] sent to ${recipients.length} recipient(s) for workspace ${workspace_id} (${topBriefs.length} briefs)`
      );
    } catch (e) {
      emailsFailed++;
      console.warn(
        `[dante digest] send failed for workspace ${workspace_id}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  return NextResponse.json({
    workspaces_checked: byWorkspace.size,
    emails_sent: emailsSent,
    emails_skipped: emailsSkipped,
    emails_failed: emailsFailed,
    dry_run: dryRun,
    ...(dryRun ? { payloads: dryRunPayloads } : {}),
  });
}

// ── Rendering ────────────────────────────────────────────────

function buildSubject(briefs: BriefRow[]): string {
  const critical = briefs.filter((b) => b.risk_level === "critical").length;
  if (critical > 0) {
    return `${critical} critical client${critical === 1 ? "" : "s"} — who to call this week`;
  }
  const n = briefs.length;
  return `${n} client${n === 1 ? "" : "s"} to call this week`;
}

interface RenderArgs {
  workspaceName: string;
  briefs: BriefRow[];
  contactById: Map<string, ContactRow>;
  appUrl: string;
}

function renderDigest(args: RenderArgs): { html: string; text: string } {
  const { workspaceName, briefs, contactById, appUrl } = args;
  const greeting = weekdayGreeting();

  // ── Plain-text version ────────────────────────────────────
  const textLines: string[] = [];
  textLines.push(`${greeting}.`);
  textLines.push("");
  textLines.push(
    `${briefs.length} client${briefs.length === 1 ? "" : "s"} Dante flagged for ${workspaceName} this week:`
  );
  textLines.push("");
  briefs.forEach((b, i) => {
    const c = contactById.get(b.contact_id);
    const name = c?.name || "Unknown contact";
    const riskTag = b.risk_level === "critical" ? " [CRITICAL]" : " [ACT NOW]";
    textLines.push(`${i + 1}. ${name}${riskTag}`);
    textLines.push(`   ${b.headline}`);
    const reason = b.reasons?.[0]?.text;
    if (reason) textLines.push(`   Why: ${reason}`);
    if (b.recommended_action) {
      textLines.push(`   Do: ${b.recommended_action}`);
    }
    textLines.push(
      `   Open: ${appUrl}/contacts?contactId=${b.contact_id}`
    );
    textLines.push("");
  });
  textLines.push(`— Dante`);
  textLines.push(`${appUrl}/dante/churn`);

  // ── HTML version ──────────────────────────────────────────
  const rows = briefs
    .map((b) => {
      const c = contactById.get(b.contact_id);
      const name = escapeHtml(c?.name || "Unknown contact");
      const riskBadge =
        b.risk_level === "critical"
          ? `<span style="background:#fee2e2;color:#b91c1c;font-size:10px;padding:2px 6px;border-radius:10px;letter-spacing:0.04em;text-transform:uppercase;font-weight:600">Critical</span>`
          : `<span style="background:#fef3c7;color:#b45309;font-size:10px;padding:2px 6px;border-radius:10px;letter-spacing:0.04em;text-transform:uppercase;font-weight:600">Act now</span>`;
      const reason = b.reasons?.[0]?.text
        ? `<div style="color:#4b5563;font-size:13px;margin-top:6px">${escapeHtml(b.reasons[0].text)}</div>`
        : "";
      const action = b.recommended_action
        ? `<div style="color:#111827;font-size:13px;margin-top:8px"><strong>Do:</strong> ${escapeHtml(b.recommended_action)}</div>`
        : "";
      const href = `${appUrl}/contacts?contactId=${b.contact_id}`;
      return `
<tr><td style="padding:16px 0;border-bottom:1px solid #e5e7eb">
  <div style="display:flex;align-items:center;gap:8px">
    <div style="font-size:15px;font-weight:600;color:#111827">${name}</div>
    ${riskBadge}
  </div>
  <div style="color:#111827;font-size:14px;margin-top:4px">${escapeHtml(b.headline)}</div>
  ${reason}
  ${action}
  <div style="margin-top:10px">
    <a href="${href}" style="font-size:13px;color:#111827;text-decoration:underline;text-underline-offset:2px">Open client →</a>
  </div>
</td></tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:28px">
        <tr><td>
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;font-weight:600;margin-bottom:6px">Dante · Client briefs</div>
          <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:#111827;font-weight:600">${greeting}</h1>
          <p style="margin:0 0 20px 0;color:#4b5563;font-size:14px;line-height:1.5">
            ${briefs.length} client${briefs.length === 1 ? "" : "s"} Dante flagged for <strong>${escapeHtml(workspaceName)}</strong> this week. Each reason cites a real row in your CRM — click through to see the source.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${rows}
          </table>
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">
            <a href="${appUrl}/dante/churn" style="color:#6b7280;text-decoration:underline">See the full list</a> · Generated by Dante on ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { html, text: textLines.join("\n") };
}

function weekdayGreeting(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ...
  if (day === 1) return "Good morning — Monday edition";
  if (day === 0 || day === 6) return "Weekend pulse";
  return `Good morning — ${d.toLocaleDateString("en-US", { weekday: "long" })} edition`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
