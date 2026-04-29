// lib/audit/log.ts
//
// The single chokepoint for inserting into audit_events. Every
// meaningful action in the application calls logAuditEvent(); the
// page at /audit and the CSV export endpoint both read what this
// helper writes.
//
// Best-effort: a logging failure is logged to console.error and
// swallowed so the calling action's user-facing path never blocks
// on audit infrastructure. The trade is "we'd rather lose an audit
// row than fail a send" — same trade Stripe / Linear / etc. make.
//
// Action naming convention: verb.noun in the entity's namespace.
//   email.send
//   reminder.approve, reminder.snooze, reminder.dismiss, reminder.send
//   property.stage_change, property.update
//   contact.review_advance
//   compliance_flag.review
//   document.upload, document.delete
//   skill.run
//
// Filters in /audit lean on this convention — `action like 'email.%'`
// captures everything email-related.

import { supabaseAdmin } from "@/lib/supabase/admin";

export type ActorKind = "user" | "agent" | "cron" | "webhook" | "system";

export interface LogAuditInput {
  workspaceId: string;
  actorUserId?: string | null;
  actorKind?: ActorKind;
  actorLabel?: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Optional Request — if passed, we extract IP + user-agent. Both
   *  are available in /api routes; pass it whenever practical so
   *  audit rows have request fingerprints. */
  request?: Request | null;
}

function extractRequestFingerprint(request?: Request | null): {
  ip: string | null;
  userAgent: string | null;
} {
  if (!request) return { ip: null, userAgent: null };
  const headers = request.headers;
  // Standard proxy headers — Vercel sets x-forwarded-for; we keep
  // only the first hop (the client) since the rest are infra.
  const xff = headers.get("x-forwarded-for");
  const ip = xff
    ? xff.split(",")[0].trim()
    : headers.get("x-real-ip") || null;
  const userAgent = headers.get("user-agent") || null;
  return { ip, userAgent };
}

export async function logAuditEvent(input: LogAuditInput): Promise<void> {
  try {
    const { ip, userAgent } = extractRequestFingerprint(input.request);
    await supabaseAdmin.from("audit_events").insert({
      workspace_id: input.workspaceId,
      actor_user_id: input.actorUserId ?? null,
      actor_kind: input.actorKind ?? "user",
      actor_label: input.actorLabel ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? null,
      ip_address: ip,
      user_agent: userAgent ? userAgent.slice(0, 500) : null,
    });
  } catch (err) {
    // Never block the calling action on audit failure.
    console.error("[audit.log]", input.action, err);
  }
}
