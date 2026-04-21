// POST /api/twilio/attach
//
// Assigns a Twilio phone number to an agent (or detaches). The number
// is matched against the live Twilio inventory first so a user can't
// write a random string into an agent's phone_number field and break
// inbound routing.
//
// Body:
//   { agent_id: string, phone_number: string | null }
//
// phone_number === null means "unassign this agent's current number".

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { getWorkspaceTwilio } from "@/lib/twilio";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!isWorkspaceAdmin(profile.role)) {
    return NextResponse.json(
      { error: "Only workspace admins can assign phone numbers." },
      { status: 403 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const agentId = typeof body?.agent_id === "string" ? body.agent_id : null;
  const rawPhone =
    body?.phone_number === null || body?.phone_number === undefined
      ? null
      : String(body.phone_number);

  if (!agentId) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }

  // Confirm the agent belongs to this workspace before we mutate it.
  const { data: agent } = await supabase
    .from("agents")
    .select("id, workspace_id, phone_number")
    .eq("id", agentId)
    .maybeSingle();

  if (!agent || agent.workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Detach path — just clear the number.
  if (rawPhone === null || rawPhone === "") {
    const { error } = await supabaseAdmin
      .from("agents")
      .update({ phone_number: null })
      .eq("id", agentId);
    if (error) {
      console.error("[twilio/attach] detach failed:", error);
      return NextResponse.json({ error: "Failed to detach." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, phone_number: null });
  }

  const normalized = normalizePhone(rawPhone);
  if (!normalized) {
    return NextResponse.json(
      { error: "That phone number doesn't look right." },
      { status: 400 },
    );
  }

  // Verify the number is actually on this workspace's Twilio account.
  // We refuse to write an arbitrary number into agent.phone_number
  // because the incoming webhook trusts that field to route calls.
  const twilioCtx = await getWorkspaceTwilio(profile.workspace_id);
  if (!twilioCtx) {
    return NextResponse.json(
      { error: "Connect your Twilio account before assigning numbers." },
      { status: 400 },
    );
  }

  let ownsNumber = false;
  try {
    const matches = await twilioCtx.client.incomingPhoneNumbers.list({
      phoneNumber: normalized,
      limit: 5,
    });
    ownsNumber = matches.some(
      (n: any) => normalizePhone(n.phoneNumber) === normalized,
    );
  } catch (err) {
    console.error("[twilio/attach] inventory check failed:", err);
    return NextResponse.json(
      { error: "Couldn't verify that number with Twilio. Try again." },
      { status: 502 },
    );
  }

  if (!ownsNumber) {
    return NextResponse.json(
      { error: "That number isn't on your Twilio account." },
      { status: 400 },
    );
  }

  // Free the number from any other agent in this workspace that might
  // still be holding it. Having two agents claim the same number is
  // exactly the ambiguity the incoming webhook has to guess around —
  // better to enforce uniqueness at write time.
  await supabaseAdmin
    .from("agents")
    .update({ phone_number: null })
    .eq("workspace_id", profile.workspace_id)
    .eq("phone_number", normalized)
    .neq("id", agentId);

  const { error: updateErr } = await supabaseAdmin
    .from("agents")
    .update({ phone_number: normalized })
    .eq("id", agentId);

  if (updateErr) {
    console.error("[twilio/attach] update failed:", updateErr);
    return NextResponse.json({ error: "Failed to assign." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, phone_number: normalized });
}
