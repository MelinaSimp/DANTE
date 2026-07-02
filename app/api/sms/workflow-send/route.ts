// app/api/sms/workflow-send/route.ts
//
// SMS delivery for n8n workflow nodes. The converter maps `send_sms`
// steps to an HTTP Request node that POSTs here; delivery runs through
// the app's SendBlue sender (iMessage with SMS fallback, chunking,
// retries, usage metering) so workflow texts behave exactly like every
// other outbound text and SendBlue credentials stay in one place.
//
// Auth: x-drift-n8n-secret shared secret (same gate as the execution
// callback). The workspace is resolved from the n8n workflow id so a
// compromised secret still can't send on behalf of an arbitrary
// workspace without also owning a registered workflow.
//
// Compliance: numbers matching a workspace contact flagged DNC are
// refused. Returns 200 with sent:false in that case — a DNC skip is a
// correct outcome, not a workflow failure.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendMessage } from "@/lib/sms/sender";
import { normalizePhone } from "@/lib/phone";
import { log as rootLog } from "@/lib/logging";

const smsLog = rootLog.child({ component: "workflow-sms" });

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = request.headers.get("x-drift-n8n-secret");
  const expected = process.env.DRIFT_N8N_CALLBACK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { n8n_workflow_id?: string; to?: string; body?: string; from_number?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { n8n_workflow_id, to, body, from_number } = payload;
  if (!n8n_workflow_id || !to || !body) {
    return NextResponse.json(
      { error: "Missing required fields: n8n_workflow_id, to, body" },
      { status: 400 },
    );
  }

  // Resolve the owning workspace from the registered workflow.
  const { data: wf } = await supabaseAdmin
    .from("dante_workflows")
    .select("id, workspace_id, name")
    .eq("n8n_workflow_id", n8n_workflow_id)
    .maybeSingle();
  if (!wf) {
    smsLog.warn("workflow-send for unknown workflow", { n8n_workflow_id });
    return NextResponse.json({ error: "Unknown workflow" }, { status: 404 });
  }

  const toPhone = normalizePhone(String(to));
  if (!toPhone) {
    return NextResponse.json({ error: `Invalid phone number: ${to}` }, { status: 422 });
  }

  // DNC check against this workspace's contacts.
  const digits = toPhone.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  const { data: dncHits } = await supabaseAdmin
    .from("contacts")
    .select("id, dnc")
    .eq("workspace_id", wf.workspace_id)
    .eq("dnc", true)
    .or(`phone.ilike.%${digits},phone.ilike.%${digits.slice(0, 3)}%${digits.slice(3, 6)}%${digits.slice(6)}`)
    .limit(1);
  if (dncHits && dncHits.length > 0) {
    smsLog.warn("workflow-send blocked by DNC", {
      workflow_id: wf.id,
      workspace_id: wf.workspace_id,
    });
    return NextResponse.json({
      sent: false,
      skipped: "recipient is flagged do-not-contact in this workspace",
    });
  }

  try {
    const result = await sendMessage(toPhone, String(body), {
      workspaceId: wf.workspace_id,
      source: `workflow:${wf.id}`,
      ...(from_number ? { fromNumber: String(from_number) } : {}),
    });
    smsLog.info("workflow SMS sent", {
      workflow_id: wf.id,
      workspace_id: wf.workspace_id,
      channel: result.delivery_channel,
      segments: result.segments,
    });
    return NextResponse.json({
      sent: true,
      delivery_channel: result.delivery_channel,
      message_id: result.message_id,
      segments: result.segments,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "send failed";
    smsLog.error("workflow SMS failed", { workflow_id: wf.id, err: msg });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
