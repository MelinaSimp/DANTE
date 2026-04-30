// POST /api/integrations/[provider]/connect
//
// Two flavors based on provider.auth_method:
//   - api_key:        body { api_key, username?, password? }
//   - oauth/partner:  returns { url } pointing at the provider's
//                     authorize endpoint with state=<connection_id>
//
// For OAuth providers the user follows the URL, comes back through
// /callback, and the connection row updates with credentials.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/integrations/adapter";
import { getProvider } from "@/lib/integrations/registry";
import { getAppUrl } from "@/lib/app-url";
import { logAuditEvent } from "@/lib/audit/log";
import { isWorkspaceAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params;
  const provider = getProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      { error: "Workspace admin role required to manage integrations" },
      { status: 403 }
    );
  }
  const workspaceId = profile.workspace_id as string;

  // Upsert a pending connection row so we can carry connection_id
  // through OAuth state.
  const { data: existing } = await supabaseAdmin
    .from("integration_connections")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider", providerId)
    .maybeSingle();

  let connectionId: string;
  if (existing) {
    connectionId = (existing as any).id;
  } else {
    const { data: created, error: insertErr } = await supabaseAdmin
      .from("integration_connections")
      .insert({
        workspace_id: workspaceId,
        provider: providerId,
        provider_kind: provider.kind,
        display_name: provider.name,
        status: "pending",
        connected_by: user.id,
      })
      .select("id")
      .single();
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    connectionId = (created as any).id;
  }

  if (provider.auth_method === "api_key") {
    const body = await req.json().catch(() => ({}));
    const adapter = await getAdapter(providerId);
    if (!adapter) {
      return NextResponse.json({ error: "Adapter not loaded" }, { status: 500 });
    }
    try {
      const result = await adapter.connect({
        workspaceId,
        api_key: body.api_key,
        username: body.username,
        password: body.password,
      });
      await supabaseAdmin
        .from("integration_connections")
        .update({
          credentials: result.credentials,
          external_account_id: result.external_account_id,
          external_account_name: result.external_account_name,
          status: "connected",
          connected_at: new Date().toISOString(),
          connected_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);
      await logAuditEvent({
        action: "integration.connect",
        actorUserId: user.id,
        workspaceId,
        entityType: "integration_connection",
        entityId: connectionId,
        metadata: { provider: providerId },
        request: req,
      }).catch(() => {});
      return NextResponse.json({ ok: true, connection_id: connectionId });
    } catch (err: any) {
      await supabaseAdmin
        .from("integration_connections")
        .update({
          status: "error",
          last_sync_error: err?.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);
      return NextResponse.json(
        { error: err?.message || "Connect failed" },
        { status: 400 }
      );
    }
  }

  // OAuth flow — return the authorize URL
  if (
    provider.auth_method === "oauth" ||
    provider.auth_method === "partner_oauth"
  ) {
    if (!provider.oauth_authorize_url) {
      return NextResponse.json(
        {
          error:
            "OAuth provider has no authorize URL configured (likely partner_pending).",
        },
        { status: 501 }
      );
    }
    const clientId = process.env[`${providerId.toUpperCase()}_CLIENT_ID`];
    if (!clientId) {
      return NextResponse.json(
        {
          error: `${providerId.toUpperCase()}_CLIENT_ID not set in environment. Configure your OAuth app first.`,
        },
        { status: 501 }
      );
    }
    const redirectUri = `${getAppUrl()}/api/integrations/${providerId}/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state: connectionId,
    });
    if (provider.oauth_scope) params.set("scope", provider.oauth_scope);

    return NextResponse.json({
      url: `${provider.oauth_authorize_url}?${params.toString()}`,
    });
  }

  return NextResponse.json(
    {
      error:
        "This provider requires partner program approval and is not yet enabled.",
    },
    { status: 501 }
  );
}
