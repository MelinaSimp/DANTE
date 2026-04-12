// lib/audit.ts
//
// Writes workspace audit log records. Uses the admin (service role)
// client so inserts bypass RLS — the RLS policies on audit_logs
// intentionally deny writes from authenticated/anon clients so we
// can never trust client-supplied audit rows.
//
// Usage (in a server route handler or server action):
//
//   await logAudit({
//     workspaceId,
//     actorId: user.id,
//     actorEmail: user.email,
//     action: "agent.deployed",
//     targetType: "agent",
//     targetId: agent.id,
//     targetLabel: agent.name,
//     metadata: { phone: agent.phone_number },
//     request, // optional: Next.js Request — IP + UA auto-captured
//   });
//
// Never throws. Audit logging must never block the primary action.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { reportError } from "@/lib/report-error";

export interface LogAuditInput {
  workspaceId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  request?: Request;
}

function extractFromRequest(req: Request | undefined) {
  if (!req) return { ipAddress: null as string | null, userAgent: null as string | null };
  const h = req.headers;
  const ipAddress =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  const userAgent = h.get("user-agent") || null;
  return { ipAddress, userAgent };
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const fromReq = extractFromRequest(input.request);
    const row = {
      workspace_id: input.workspaceId,
      actor_id: input.actorId ?? null,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      target_label: input.targetLabel ?? null,
      metadata: input.metadata ?? {},
      ip_address: input.ipAddress ?? fromReq.ipAddress,
      user_agent: input.userAgent ?? fromReq.userAgent,
    };

    const { error } = await supabaseAdmin.from("audit_logs").insert(row);
    if (error) {
      reportError("audit.log")(error);
    }
  } catch (err) {
    // Audit logging must never break the primary action.
    reportError("audit.log")(err);
  }
}

/**
 * Known action names. Use this union when emitting from code to
 * keep naming consistent across the app.
 */
export type AuditAction =
  | "workspace.created"
  | "workspace.updated"
  | "workspace.member_invited"
  | "workspace.member_removed"
  | "workspace.member_role_changed"
  | "workspace.data_exported"
  | "agent.created"
  | "agent.updated"
  | "agent.deleted"
  | "agent.deployed"
  | "agent.undeployed"
  | "scenario.created"
  | "scenario.updated"
  | "scenario.deleted"
  | "automation.enabled"
  | "automation.disabled"
  | "integration.connected"
  | "integration.disconnected"
  | "api_key.created"
  | "api_key.revoked"
  | "billing.subscription_created"
  | "billing.subscription_canceled"
  | "auth.sso_configured";
