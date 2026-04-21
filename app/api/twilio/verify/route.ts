// POST /api/twilio/verify
//
// Validates a pair of Twilio credentials by fetching the account from
// Twilio's API, then persists them into `twilio_credentials` so the
// rest of the app (lib/twilio.ts:getWorkspaceTwilio) can use them.
//
// Admin-only — these creds are effectively a password to the
// workspace's Twilio bill, not something a regular member should be
// able to swap out.

import { NextResponse } from "next/server";
import twilio from "twilio";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { encryptSecret } from "@/lib/crypto/secrets";

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
      { error: "Only workspace admins can manage Twilio credentials." },
      { status: 403 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accountSid = String(body?.account_sid || "").trim();
  const authToken = String(body?.auth_token || "").trim();

  if (!/^AC[a-zA-Z0-9]{32}$/.test(accountSid)) {
    return NextResponse.json(
      {
        error:
          "That doesn't look like a Twilio Account SID. It should start with AC and be 34 characters.",
      },
      { status: 400 },
    );
  }
  if (authToken.length < 16) {
    return NextResponse.json(
      { error: "Auth token looks too short — double-check you copied the whole thing." },
      { status: 400 },
    );
  }

  // Fetch the account. If the credentials are wrong Twilio returns 401
  // which the SDK surfaces as an error; catch and report nicely.
  let friendlyName: string | null = null;
  try {
    const client = twilio(accountSid, authToken);
    const account = await client.api.accounts(accountSid).fetch();
    friendlyName = account.friendlyName ?? null;
    if (account.status !== "active") {
      return NextResponse.json(
        {
          error: `Twilio reports this account is ${account.status}. Reactivate it in the Twilio console before connecting.`,
        },
        { status: 400 },
      );
    }
  } catch (err: any) {
    const msg = err?.message || "";
    if (err?.status === 401 || /authenticate/i.test(msg)) {
      return NextResponse.json(
        { error: "Twilio rejected those credentials. Check the SID and auth token and try again." },
        { status: 400 },
      );
    }
    console.error("[twilio/verify] lookup failed:", err);
    return NextResponse.json(
      { error: "Couldn't reach Twilio to verify those credentials. Try again in a moment." },
      { status: 502 },
    );
  }

  // Persist via admin client so we don't depend on row-level policies
  // being in place for `twilio_credentials`. The workspace_id we write
  // is the caller's own, enforced above. Auth token is encrypted at
  // rest (AES-256-GCM, key in DRIFT_SECRET_KEY) — see lib/crypto/secrets.
  let encryptedToken: string;
  try {
    encryptedToken = encryptSecret(authToken);
  } catch (err) {
    console.error("[twilio/verify] encrypt failed:", err);
    return NextResponse.json(
      { error: "Server isn't configured for secret encryption. Contact support." },
      { status: 500 },
    );
  }

  const { error: upsertErr } = await supabaseAdmin
    .from("twilio_credentials")
    .upsert(
      {
        workspace_id: profile.workspace_id,
        account_sid: accountSid,
        auth_token: encryptedToken,
      },
      { onConflict: "workspace_id" },
    );

  if (upsertErr) {
    console.error("[twilio/verify] upsert failed:", upsertErr);
    return NextResponse.json(
      { error: "Credentials verified but we couldn't save them. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, friendly_name: friendlyName });
}
