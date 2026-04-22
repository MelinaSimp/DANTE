// app/api/scheduled-emails/process/route.ts
// Background job to send scheduled email reminders
// Called by Vercel Cron or external cron service

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { recordEmailUsage } from "@/lib/usage/track";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Process scheduled emails
 * GET /api/scheduled-emails/process
 *
 * Called by Vercel Cron daily at midnight.
 * Sends all pending emails whose scheduled_at <= now.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[Scheduled Emails] RESEND_API_KEY not configured");
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
    }

    const resend = new Resend(apiKey);
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Drift <noreply@driftai.studio>";

    // Find pending emails scheduled for now or earlier
    const now = new Date().toISOString();
    const { data: pendingEmails, error } = await supabaseAdmin
      .from("scheduled_emails")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .limit(100);

    if (error) {
      console.error("[Scheduled Emails] Error fetching:", error);
      return NextResponse.json({ error: "Failed to fetch scheduled emails" }, { status: 500 });
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return NextResponse.json({ processed: 0, failed: 0 });
    }

    // Filter out emails whose workspace is no longer in good standing.
    // Past_due/canceled workspaces shouldn't keep sending on our dime.
    const workspaceIds = Array.from(
      new Set(pendingEmails.map((e) => e.workspace_id).filter(Boolean))
    );
    const activeWorkspaces = new Set<string>();
    if (workspaceIds.length > 0) {
      const { data: wsRows } = await supabaseAdmin
        .from("workspaces")
        .select("id, plan_status")
        .in("id", workspaceIds);
      for (const w of wsRows ?? []) {
        if (w.plan_status === "active" || w.plan_status === "trialing") {
          activeWorkspaces.add(w.id);
        }
      }
    }

    let processed = 0;
    let failed = 0;
    let skippedBilling = 0;

    for (const email of pendingEmails) {
      if (email.workspace_id && !activeWorkspaces.has(email.workspace_id)) {
        await supabaseAdmin
          .from("scheduled_emails")
          .update({
            status: "failed",
            error_message: "Workspace billing not active",
            error_code: "billing_inactive",
          })
          .eq("id", email.id);
        skippedBilling++;
        continue;
      }
      try {
        const { error: sendError } = await resend.emails.send({
          from: fromEmail,
          to: email.to_email,
          subject: email.subject,
          html: email.html_content,
        });

        if (sendError) {
          throw new Error(sendError.message);
        }

        await supabaseAdmin
          .from("scheduled_emails")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", email.id);

        if (email.workspace_id) {
          recordEmailUsage({
            workspaceId: email.workspace_id,
            recipientCount: 1,
            source: "scheduled",
            metadata: { scheduled_email_id: email.id },
          });
        }

        processed++;
        console.log(`[Scheduled Emails] Sent email ${email.id} to ${email.to_email}`);
      } catch (err: any) {
        console.error(`[Scheduled Emails] Failed to send ${email.id}:`, err);

        const isRetryable =
          err.message?.includes("rate") ||
          err.message?.includes("timeout") ||
          err.statusCode === 429;

        await supabaseAdmin
          .from("scheduled_emails")
          .update({
            status: isRetryable ? "pending" : "failed",
            error_message: err.message || String(err),
            error_code: err.statusCode ? String(err.statusCode) : null,
            scheduled_at: isRetryable
              ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
              : email.scheduled_at,
          })
          .eq("id", email.id);

        failed++;
      }
    }

    return NextResponse.json({ processed, failed, skipped_billing: skippedBilling });
  } catch (error: any) {
    console.error("[Scheduled Emails] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
