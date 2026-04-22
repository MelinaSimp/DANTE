// lib/billing/gate.ts
//
// Subscription gate for billable routes. Call this at the top of any
// endpoint that triggers LLM calls, emails, SMS, voice minutes, or
// other metered work.
//
// Two checks, in order:
//   1. plan_status — must be "active" or "trialing". Anything else
//      (past_due, canceled, inactive, null) returns 402 Payment
//      Required so the client can route the user to the billing page.
//   2. hard-cap overage — if the workspace has hard_cap enabled and
//      has blown past its monthly limits, block with 429-equivalent
//      402 (we use 402 consistently; the `reason` in the body tells
//      the client which path to show).
//
// The helper is intentionally cheap: one .select on workspaces plus
// the existing isHardCapped() (which itself is two queries). We run
// them in parallel. If you're worried about the ~50ms, cache per-
// request — but don't bypass the check.
//
// ESCAPE HATCH: set `BILLING_GATE_DISABLED=1` in env to no-op the gate
// for local dev / emergency kill-switch. Logs a warning so we don't
// forget. Never set this in production.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isHardCapped } from "@/lib/usage/quota";

export type GateDenyReason =
  | "no_workspace"
  | "plan_past_due"
  | "plan_canceled"
  | "plan_inactive"
  | "hard_cap_exceeded";

export interface GateOk {
  ok: true;
  plan_status: string;
}

export interface GateDeny {
  ok: false;
  reason: GateDenyReason;
  plan_status: string | null;
  response: NextResponse;
}

export type GateResult = GateOk | GateDeny;

const ALLOWED_STATUSES = new Set(["active", "trialing"]);

function deny(
  reason: GateDenyReason,
  planStatus: string | null,
  message: string,
  status = 402
): GateDeny {
  return {
    ok: false,
    reason,
    plan_status: planStatus,
    response: NextResponse.json(
      {
        error: message,
        reason,
        plan_status: planStatus,
        billing_url: "/settings",
      },
      { status }
    ),
  };
}

/**
 * Gate a billable route. Pass the workspace_id you already resolved
 * from the session. Returns `{ ok: true }` or `{ ok: false, response }`
 * — return the `response` directly to short-circuit the handler.
 */
export async function requireActiveBilling(
  workspaceId: string | null | undefined
): Promise<GateResult> {
  if (process.env.BILLING_GATE_DISABLED === "1") {
    console.warn("[billing-gate] DISABLED via env — skipping subscription check");
    return { ok: true, plan_status: "bypassed" };
  }

  if (!workspaceId) {
    return deny(
      "no_workspace",
      null,
      "No workspace associated with this request",
      400
    );
  }

  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("plan_status")
    .eq("id", workspaceId)
    .maybeSingle();

  const planStatus = (ws?.plan_status ?? "inactive") as string;

  if (!ALLOWED_STATUSES.has(planStatus)) {
    const reason: GateDenyReason =
      planStatus === "past_due" ? "plan_past_due"
      : planStatus === "canceled" ? "plan_canceled"
      : "plan_inactive";
    const message =
      planStatus === "past_due"
        ? "Your subscription payment is past due. Update billing to continue."
        : planStatus === "canceled"
        ? "Your subscription has been canceled. Resubscribe to continue."
        : "An active subscription is required for this feature.";
    return deny(reason, planStatus, message);
  }

  // Status is OK — check the hard cap. Only blocks workspaces that
  // opted into a hard cap AND have blown past their quota.
  const capped = await isHardCapped(workspaceId);
  if (capped) {
    return deny(
      "hard_cap_exceeded",
      planStatus,
      "Monthly usage cap reached. Raise your cap or wait for the next billing cycle."
    );
  }

  return { ok: true, plan_status: planStatus };
}
