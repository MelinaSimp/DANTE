// lib/dante/usage/notify.ts
//
// Ops-side overage notifications. When a workspace's MTD spend
// crosses 100/125/150/200% of allowance, this module sends one
// email to driftaillc@gmail.com per (workspace, month, threshold)
// — deduped via dante_usage_notifications so the same threshold
// can't fire twice in the same calendar month.
//
// Called from the route that returns getUsageStatus() so the
// notification fires the moment the banner would surface to the
// customer; we don't want the customer to see the breach before
// you do.

import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { UsageStatus } from "@/lib/dante/model-router";

const OPS_EMAIL = "driftaillc@gmail.com";

function yearMonth(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function thresholdCopy(pct: number): { subject: string; tone: string } {
  if (pct >= 200) {
    return {
      subject: "200%+ AI overage — talk to this customer",
      tone: "Substantial overage. Reach out before the invoice surprise.",
    };
  }
  if (pct >= 150) {
    return {
      subject: "150%+ AI overage — consider plan adjustment",
      tone: "Sustained heavy use. If this is the new normal, propose a higher allowance.",
    };
  }
  if (pct >= 125) {
    return {
      subject: "125%+ AI overage — heads up",
      tone: "Customer is over allowance. Invoice will reflect overage; no action needed yet.",
    };
  }
  return {
    subject: "100% AI allowance crossed",
    tone: "Customer just crossed their monthly allowance. Banner shown; first overage tier active.",
  };
}

interface NotifyArgs {
  workspaceId: string;
  status: UsageStatus;
}

/**
 * Fire an ops notification if the workspace's current threshold
 * tier hasn't been notified for this month yet. Idempotent — calling
 * this on every chat turn is fine; the unique index prevents dupes.
 */
export async function maybeNotifyOverage({ workspaceId, status }: NotifyArgs): Promise<void> {
  if (status.tier_breached === null) return;

  const ym = yearMonth();
  const tier = status.tier_breached;

  // Try to claim this (workspace, month, threshold) slot. The unique
  // index ensures only one writer wins; subsequent attempts no-op.
  const { error: claimErr } = await supabaseAdmin
    .from("dante_usage_notifications")
    .insert({
      workspace_id: workspaceId,
      year_month: ym,
      threshold_pct: tier,
    });
  if (claimErr) {
    // 23505 = unique violation = already notified this tier this month.
    // Anything else is a real problem; log and exit.
    if (!claimErr.message.includes("duplicate") && claimErr.code !== "23505") {
      console.error("[overage-notify] claim failed:", claimErr.message);
    }
    return;
  }

  // Resolve workspace name for the email body.
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("name, monthly_price_cents, usage_allowance_cents, overage_markup_pct")
    .eq("id", workspaceId)
    .maybeSingle();
  const wsName = ws?.name || workspaceId;

  const { subject, tone } = thresholdCopy(tier);
  const mtdDollars = (status.mtd_cents / 100).toFixed(2);
  const limitDollars = (status.limit_cents / 100).toFixed(2);
  const overageDollars = Math.max(0, status.mtd_cents - status.limit_cents) / 100;
  const overageBilled = (overageDollars * (1 + status.overage_markup_pct / 100)).toFixed(2);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[overage-notify] RESEND_API_KEY unset; would have emailed:", { wsName, tier, mtdDollars });
    return;
  }
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Drift <ops@driftai.studio>";

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from: fromEmail,
      to: OPS_EMAIL,
      subject: `[${wsName}] ${subject}`,
      text: [
        `Workspace: ${wsName}`,
        `Threshold: ${tier}% — ${tone}`,
        ``,
        `MTD AI cost:   $${mtdDollars}`,
        `Allowance:     $${limitDollars}`,
        `Overage:       $${overageDollars.toFixed(2)} (raw)`,
        `Billed (×${(1 + status.overage_markup_pct / 100).toFixed(2)}): $${overageBilled}`,
        ``,
        `Open admin: https://driftai.studio/admin/customers/${workspaceId}`,
      ].join("\n"),
    });
  } catch (e) {
    console.error("[overage-notify] resend send failed:", e);
  }
}
