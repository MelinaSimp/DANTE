// GET /api/twilio/numbers
//
// Returns the full picture needed by the Phone Numbers settings panel:
//
//   { connected, friendlyName, numbers, agents, webhookUrls }
//
// `numbers` is the live list of Twilio phone numbers on the connected
// account (not a cached DB copy — that's always one sync behind reality
// and introduces a class of "why isn't my new number showing up" bugs).
// Each is annotated with which agent, if any, currently owns it inside
// this workspace.
//
// `agents` is the set of agents in this workspace that could be
// assigned a number. Kept on the server so the UI doesn't have to do
// a second round-trip to populate the dropdown.
//
// `webhookUrls` are the URLs the user pastes into Twilio's "A call
// comes in" / "A message comes in" fields. Derived from NEXT_PUBLIC_APP_URL
// with a sensible fallback to the request host.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { getWorkspaceTwilio } from "@/lib/twilio";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

function resolveAppUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  try {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "https://driftai.studio";
  }
}

export async function GET(request: Request) {
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
      { error: "Only workspace admins can view phone number settings." },
      { status: 403 },
    );
  }

  const appUrl = resolveAppUrl(request);
  const webhookUrls = {
    voice: `${appUrl}/api/twilio/incoming`,
    sms: `${appUrl}/api/twilio/sms`,
    statusCallback: `${appUrl}/api/twilio/status`,
  };

  const twilioCtx = await getWorkspaceTwilio(profile.workspace_id);
  if (!twilioCtx) {
    return NextResponse.json({
      connected: false,
      friendlyName: null,
      numbers: [],
      agents: [],
      webhookUrls,
    });
  }

  const { client, creds } = twilioCtx;

  // Agents in this workspace, with their currently-assigned numbers.
  // We only need the ones that are callable — the incoming webhook
  // only cares about non-specialist voice-capable agents, but for the
  // UI we list everything and let the user make the call.
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, phone_number, status, is_specialist")
    .eq("workspace_id", profile.workspace_id)
    .order("name", { ascending: true });

  // Live fetch of Twilio numbers. Small accounts have <50; we page up
  // to a hard cap so we don't hang on a misconfigured account.
  let twilioNumbers: Array<{
    sid: string;
    phoneNumber: string;
    friendlyName: string | null;
    capabilities: {
      voice: boolean;
      sms: boolean;
      mms: boolean;
    };
    voiceUrl: string | null;
    smsUrl: string | null;
  }> = [];

  let friendlyName: string | null = null;
  try {
    const account = await client.api.accounts(creds.account_sid).fetch();
    friendlyName = account.friendlyName ?? null;

    const list = await client.incomingPhoneNumbers.list({ limit: 200 });
    // The twilio SDK's IncomingPhoneNumberInstance type isn't re-
    // exported cleanly from the package root; `any` here is fine —
    // the fields we read are stable public API.
    twilioNumbers = list.map((n: any) => ({
      sid: n.sid,
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName ?? null,
      capabilities: {
        voice: !!n.capabilities?.voice,
        sms: !!n.capabilities?.sms,
        mms: !!n.capabilities?.mms,
      },
      voiceUrl: n.voiceUrl || null,
      smsUrl: n.smsUrl || null,
    }));
  } catch (err: any) {
    console.error("[twilio/numbers] Twilio API failed:", err);
    return NextResponse.json(
      {
        connected: true,
        friendlyName: null,
        numbers: [],
        agents: agents || [],
        webhookUrls,
        error:
          err?.status === 401
            ? "Twilio rejected the saved credentials. Disconnect and reconnect with fresh credentials."
            : "Couldn't reach Twilio to list your numbers. Try again in a moment.",
      },
      { status: 200 },
    );
  }

  // Stitch agent assignments onto each number. We match by E.164-
  // normalised phone so an agent row saved with "+15551234567" matches
  // a Twilio listing of "+15551234567" regardless of any legacy
  // variations (spaces, dashes) in the agent row.
  const agentsByNormalizedPhone = new Map<string, { id: string; name: string }>();
  for (const a of agents || []) {
    if (!a.phone_number) continue;
    const key = normalizePhone(a.phone_number);
    if (key) agentsByNormalizedPhone.set(key, { id: a.id, name: a.name });
  }

  const numbersWithAssignments = twilioNumbers.map((n) => {
    const key = normalizePhone(n.phoneNumber);
    const attached = key ? agentsByNormalizedPhone.get(key) || null : null;
    const webhookReady =
      (n.voiceUrl?.startsWith(webhookUrls.voice) ?? false) &&
      (n.smsUrl?.startsWith(webhookUrls.sms) ?? false);
    return {
      ...n,
      attachedAgent: attached,
      webhookReady,
    };
  });

  return NextResponse.json({
    connected: true,
    friendlyName,
    numbers: numbersWithAssignments,
    agents: (agents || []).map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      isSpecialist: a.is_specialist,
      phoneNumber: a.phone_number,
    })),
    webhookUrls,
  });
}
