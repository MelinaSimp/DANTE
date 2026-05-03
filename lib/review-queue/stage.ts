// lib/review-queue/stage.ts
//
// The single helper any autonomous producer (workflow runner,
// scheduled reminder, autonomous agent, cron job) calls to stage
// a client-facing artifact into the review queue. Phase 1 W1.3.
//
// Pattern:
//
//   await stageForReview({
//     workspaceId,
//     kind: "email",
//     payload: { to, subject, body },
//     sourceKind: "autonomous_agent",
//     sourceId: agentId,
//     contactId,
//     sendCallback: { route: "/api/email/send-approved", data: { ... } },
//   });
//
// Once a reviewer approves the row, the queue worker invokes
// `sendCallback.route` with `sendCallback.data` and updates the
// row to 'sent' or 'failed'. Producers never call email/SMS
// providers directly; everything client-facing flows through here.
//
// User-driven sends (the advisor types into the UI and clicks send)
// can bypass this — their click IS the supervisory event. This
// helper is for the autonomous path only.

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface StageInput {
  workspaceId: string;
  /** Free-form taxonomy. UI groups by this. See migration for examples. */
  kind: string;
  /** Producer-shaped payload — the renderable artifact. */
  payload: Record<string, unknown>;

  sourceKind?: string;
  sourceId?: string;
  contactId?: string;

  /** What to invoke when a reviewer approves. */
  sendCallback?: {
    route: string;
    data?: Record<string, unknown>;
  };

  /** Pre-approved (skip the queue, go straight to sent). Use only
   *  when the policy says this kind doesn't require supervision —
   *  e.g. internal-only summaries. */
  preApproved?: boolean;
}

export interface StageResult {
  id: string;
  status: "pending" | "approved";
}

export async function stageForReview(input: StageInput): Promise<StageResult> {
  const status = input.preApproved ? "approved" : "pending";

  const { data, error } = await supabaseAdmin
    .from("outbound_review_queue")
    .insert({
      workspace_id: input.workspaceId,
      kind: input.kind,
      payload: input.payload,
      source_kind: input.sourceKind ?? null,
      source_id: input.sourceId ?? null,
      contact_id: input.contactId ?? null,
      review_status: status,
      send_callback_route: input.sendCallback?.route ?? null,
      send_callback_data: input.sendCallback?.data ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`stageForReview: ${error.message}`);
  }
  return { id: (data as { id: string }).id, status };
}

/** Mark a queue row as sent (called by the producer's callback after
 *  a successful real send). */
export async function markSent(id: string, workspaceId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("outbound_review_queue")
    .update({ review_status: "sent", sent_at: new Date().toISOString(), send_error: null })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(`markSent: ${error.message}`);
}

/** Mark a queue row as failed (called when the post-approval send
 *  errored). The reviewer can choose to re-approve, which the queue
 *  worker treats as a retry. */
export async function markFailed(
  id: string,
  workspaceId: string,
  errMessage: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("outbound_review_queue")
    .update({
      review_status: "failed",
      send_error: errMessage.slice(0, 500),
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(`markFailed: ${error.message}`);
}
