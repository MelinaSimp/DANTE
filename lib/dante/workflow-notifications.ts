// lib/dante/workflow-notifications.ts
//
// Notification helpers for workflow execution failures.
// Extracted from run-executor.ts during n8n migration (Phase 3).

import { supabaseAdmin } from "@/lib/supabase/admin";
import { log as rootLog } from "@/lib/logging";

const notifyLog = rootLog.child({ component: "workflow-notifications" });

const OPS_EMAIL = "driftaillc@gmail.com";

/**
 * Notify workspace owners when a workflow run fails.
 * Sends email (via Resend) and SMS (if owner has verified phone).
 * Fire-and-forget -- never throws.
 */
export async function notifyRunFailure(opts: {
  workflowId: string;
  workflowName: string;
  workspaceId: string;
  runId: string;
  error: string;
}): Promise<void> {
  try {
    const { data: owners } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, sms_phone, sms_verified_at")
      .eq("workspace_id", opts.workspaceId)
      .eq("role", "owner");

    if (!owners?.length) return;

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || "Drift <ops@driftai.studio>";
    const errorSnippet = opts.error.length > 300
      ? opts.error.slice(0, 297) + "..."
      : opts.error;

    for (const owner of owners) {
      // Email (via auth.users since email isn't on profiles)
      if (apiKey) {
        try {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(owner.id);
          const email = authUser.user?.email;
          if (email) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from,
                to: email,
                subject: `Workflow failed: ${opts.workflowName}`,
                text: [
                  `Your workflow "${opts.workflowName}" just failed.`,
                  ``,
                  `Error: ${errorSnippet}`,
                  ``,
                  `View the run: https://driftai.studio/dante/workflows/${opts.workflowId}`,
                ].join("\n"),
              }),
            });
          }
        } catch (e) {
          notifyLog.warn("notification email failed", { error: e instanceof Error ? e.message : String(e) });
        }
      }

      // SMS if owner has a verified phone
      const p = owner as { sms_phone: string | null; sms_verified_at: string | null };
      if (p.sms_phone && p.sms_verified_at) {
        try {
          const { sendMessage } = await import("@/lib/sms/sender");
          await sendMessage(
            p.sms_phone,
            `Workflow failed: ${opts.workflowName}\n${errorSnippet}`,
          );
        } catch (e) {
          notifyLog.warn("notification SMS failed", { error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  } catch (e) {
    notifyLog.warn("notification failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Check for consecutive workflow failures and escalate if threshold hit.
 * Sends alerts to both ops and workspace owners at exactly 3 consecutive failures.
 */
export async function checkConsecutiveFailures(opts: {
  workflowId: string;
  workflowName: string;
  workspaceId: string;
}): Promise<void> {
  const STREAK_THRESHOLD = 3;

  try {
    const { data: recentRuns } = await supabaseAdmin
      .from("dante_workflow_runs")
      .select("status")
      .eq("workflow_id", opts.workflowId)
      .order("started_at", { ascending: false })
      .limit(STREAK_THRESHOLD + 1);

    if (!recentRuns) return;

    let streak = 0;
    for (const r of recentRuns) {
      if (r.status === "error") streak++;
      else break;
    }

    if (streak < STREAK_THRESHOLD) return;
    // Exact-threshold alert: only fire at 3, not at 4, 5, ...
    if (streak > STREAK_THRESHOLD) return;

    notifyLog.warn("consecutive failure threshold reached", {
      workflowId: opts.workflowId,
      workflowName: opts.workflowName,
      streak,
    });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const from = process.env.RESEND_FROM_EMAIL || "Drift <ops@driftai.studio>";
    const subject = `[Alert] "${opts.workflowName}" has failed ${streak} times in a row`;
    const body = [
      `Workflow "${opts.workflowName}" has failed ${streak} consecutive times.`,
      ``,
      `This usually means something is structurally wrong -- a missing API key,`,
      `a bad URL, or a downstream service that's offline.`,
      ``,
      `Review the run history: https://driftai.studio/dante/workflows/${opts.workflowId}`,
      ``,
      `The workflow will continue to run on its schedule. If the problem persists,`,
      `consider disabling it until the root cause is fixed.`,
    ].join("\n");

    // Send to ops
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: OPS_EMAIL, subject, text: body }),
      });
    } catch {
      // Best effort
    }

    // Also send to workspace owners
    const { data: owners } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("workspace_id", opts.workspaceId)
      .eq("role", "owner");

    if (owners?.length) {
      for (const owner of owners) {
        try {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(owner.id);
          const email = authUser.user?.email;
          if (email && email !== OPS_EMAIL) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from, to: email, subject, text: body }),
            });
          }
        } catch {
          // Best effort
        }
      }
    }
  } catch (e) {
    notifyLog.warn("consecutive failure check failed", { error: e instanceof Error ? e.message : String(e) });
  }
}
