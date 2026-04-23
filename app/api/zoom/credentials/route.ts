// GET  /api/zoom/credentials  — status (does a row exist? which Zoom user?)
// POST /api/zoom/credentials  — verify + save
// DELETE /api/zoom/credentials — disconnect
//
// Admin-only write path, mirroring Twilio's. Client secret + webhook
// secret are encrypted at rest via lib/crypto/secrets.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { encryptSecret } from "@/lib/crypto/secrets";
import { fetchZoomUser } from "@/lib/zoom/client";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return { error: NextResponse.json({ error: "No workspace" }, { status: 400 }) };
  }
  if (!isWorkspaceAdmin(profile.role)) {
    return {
      error: NextResponse.json(
        { error: "Only workspace admins can manage Zoom credentials." },
        { status: 403 }
      ),
    };
  }
  return { workspaceId: profile.workspace_id as string, userId: user.id };
}

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ connected: false });
  }
  const { data } = await supabaseAdmin
    .from("zoom_credentials")
    .select("account_id, zoom_user_email, zoom_account_type, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!data) return NextResponse.json({ connected: false });
  return NextResponse.json({
    connected: true,
    account_id: data.account_id,
    zoom_user_email: data.zoom_user_email,
    zoom_account_type: data.zoom_account_type,
    updated_at: data.updated_at,
  });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { workspaceId } = guard;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accountId = String(body?.account_id || "").trim();
  const clientId = String(body?.client_id || "").trim();
  const clientSecret = String(body?.client_secret || "").trim();
  const webhookSecret = String(body?.webhook_secret || "").trim();

  if (!accountId || !clientId || !clientSecret || !webhookSecret) {
    return NextResponse.json(
      {
        error:
          "All four fields are required: Account ID, Client ID, Client Secret, Webhook Secret Token.",
      },
      { status: 400 }
    );
  }

  // Encrypt before we probe Zoom — if the probe succeeds we want to
  // write immediately, and encryption is the only step that can
  // realistically fail here (missing DRIFT_SECRET_KEY).
  let encClientSecret: string;
  let encWebhookSecret: string;
  try {
    encClientSecret = encryptSecret(clientSecret);
    encWebhookSecret = encryptSecret(webhookSecret);
  } catch (err) {
    console.error("[zoom/credentials] encrypt failed:", err);
    return NextResponse.json(
      { error: "Server isn't configured for secret encryption. Contact support." },
      { status: 500 }
    );
  }

  // Write first so fetchZoomUser's loadZoomCredentials can read them
  // back. If the probe fails we roll back.
  const { error: upsertErr } = await supabaseAdmin
    .from("zoom_credentials")
    .upsert(
      {
        workspace_id: workspaceId,
        account_id: accountId,
        client_id: clientId,
        client_secret: encClientSecret,
        webhook_secret: encWebhookSecret,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" }
    );
  if (upsertErr) {
    return NextResponse.json(
      { error: `Failed to save credentials: ${upsertErr.message}` },
      { status: 500 }
    );
  }

  let info: Awaited<ReturnType<typeof fetchZoomUser>>;
  try {
    info = await fetchZoomUser(workspaceId);
  } catch (err: any) {
    // Roll back so we don't leave a half-valid row behind.
    await supabaseAdmin
      .from("zoom_credentials")
      .delete()
      .eq("workspace_id", workspaceId);
    const msg = err?.message || "";
    if (/401/.test(msg) || /invalid_client/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            "Zoom rejected those credentials. Double-check the Account ID, Client ID, and Client Secret from your S2S OAuth app.",
        },
        { status: 400 }
      );
    }
    console.error("[zoom/credentials] probe failed:", err);
    return NextResponse.json(
      { error: `Couldn't reach Zoom to verify credentials: ${msg.slice(0, 200)}` },
      { status: 502 }
    );
  }

  if (info.plan_type !== 2) {
    // Roll back — Basic plan can't do cloud recording.
    await supabaseAdmin
      .from("zoom_credentials")
      .delete()
      .eq("workspace_id", workspaceId);
    return NextResponse.json(
      {
        error:
          "That Zoom account is on the Basic (free) plan. Cloud recording requires Zoom Pro or higher — upgrade in Zoom's billing settings, then reconnect.",
      },
      { status: 400 }
    );
  }

  await supabaseAdmin
    .from("zoom_credentials")
    .update({
      zoom_user_email: info.email,
      zoom_account_type: info.account_type,
    })
    .eq("workspace_id", workspaceId);

  return NextResponse.json({
    ok: true,
    zoom_user_email: info.email,
    zoom_account_type: info.account_type,
  });
}

export async function DELETE() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { workspaceId } = guard;
  await supabaseAdmin
    .from("zoom_credentials")
    .delete()
    .eq("workspace_id", workspaceId);
  return NextResponse.json({ ok: true });
}
