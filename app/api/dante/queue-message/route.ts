// app/api/dante/queue-message/route.ts
//
// Stage a Dante / Vergil assistant message into the supervisor
// outbound review queue. Used by the "Queue for review" action in
// AssistantMessage — the advisor reads a draft response, decides it's
// worth a principal's eyes, and queues it. A supervisor (RIA principal
// / realtor designated broker) approves or rejects from
// /admin/review-queue.
//
// Unlike the autonomous-output stagers (workflow runner, scheduled
// reminders), this is advisor-driven — there's no sendCallback. The
// queue row is a compliance-review artifact, not a delivery payload.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { stageForReview } from "@/lib/review-queue/stage";

export const dynamic = "force-dynamic";

interface QueueBody {
  /** The assistant message body (markdown). */
  content: string;
  /** Optional chat / message identifiers so the reviewer can deep-link. */
  chatId?: string;
  messageId?: string;
  /** Optional contact id this draft pertains to (drives reviewer filters). */
  contactId?: string;
  /** Optional one-line note to the reviewer. */
  note?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no_workspace");

  const body = (await req.json().catch(() => null)) as QueueBody | null;
  if (!body || typeof body.content !== "string" || body.content.trim().length === 0) {
    return jsonError(400, "content required");
  }
  // Cap at 64 KB so a runaway markdown blob doesn't bloat the queue row.
  const content = body.content.slice(0, 64 * 1024);
  const note = (body.note || "").trim().slice(0, 500) || null;

  const result = await stageForReview({
    workspaceId: profile.workspace_id,
    kind: "dante_review",
    payload: {
      content,
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
      chat_id: body.chatId ?? null,
      message_id: body.messageId ?? null,
      note,
    },
    sourceKind: "dante_chat",
    sourceId: body.messageId ?? body.chatId ?? undefined,
    contactId: body.contactId ?? undefined,
  });

  return NextResponse.json({ id: result.id, status: result.status });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
