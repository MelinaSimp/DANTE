// app/api/dante/hooks/[token]/route.ts
//
// Public webhook receiver for workflows with a trigger_webhook node.
// Any POST to this URL enqueues a run of the owning workflow. The
// request body is passed as the run `input`, so downstream nodes
// can reference {{steps.<trigger_id>.input.<field>}}.
//
// We intentionally enqueue instead of running inline so:
//   1. The caller isn't kept on the wire for potentially minute-long
//      workflows (integrations like Stripe webhooks will retry if you
//      go past a few seconds).
//   2. A burst of webhooks (e.g. form-submission storm) gets flattened
//      by the queue worker instead of fanning out to N parallel
//      runner lambdas that all do OpenAI calls at once.
//
// Auth: the token itself is the secret. We look up dante_webhook_tokens
// via the service-role client so workspaces are still scoped without
// needing a user session.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { enqueueRun, kickQueueWorker } from "@/lib/dante/run-executor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data: tokenRow } = await supabaseAdmin
    .from("dante_webhook_tokens")
    .select("token, workflow_id, workspace_id")
    .eq("token", token)
    .maybeSingle();
  if (!tokenRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: wf } = await supabaseAdmin
    .from("dante_workflows")
    .select("id, workspace_id, enabled")
    .eq("id", tokenRow.workflow_id)
    .maybeSingle();
  if (!wf || !wf.enabled) {
    return NextResponse.json({ error: "Workflow disabled" }, { status: 403 });
  }

  const input = await request.json().catch(() => ({}));

  const result = await enqueueRun({
    workflow_id: wf.id,
    workspace_id: wf.workspace_id,
    triggered_by: null,
    payload: { ...input, _trigger: "webhook" },
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Eager kick so the queue worker picks this up immediately instead
  // of waiting for the next cron minute.
  kickQueueWorker(new URL(request.url).origin);

  return NextResponse.json({ run_id: result.run_id, status: "queued" });
}
