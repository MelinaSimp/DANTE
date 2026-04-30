// GET /api/integrations/[provider]/callback?code=...&state=<connection_id>
//
// OAuth redirect target. Exchanges code → token via the adapter,
// stores credentials on the connection row, redirects back to
// /settings/integrations.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/integrations/adapter";
import { getAppUrl } from "@/lib/app-url";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const appUrl = getAppUrl();
  const settingsUrl = `${appUrl}/settings/integrations`;

  if (errorParam) {
    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent(`${providerId}: ${errorParam}`)}`
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent("Missing code or state")}`
    );
  }

  // Look up the pending connection
  const { data: connection } = await supabaseAdmin
    .from("integration_connections")
    .select("id, workspace_id, provider")
    .eq("id", state)
    .eq("provider", providerId)
    .maybeSingle();
  if (!connection) {
    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent("Unknown connection state")}`
    );
  }

  const adapter = await getAdapter(providerId);
  if (!adapter) {
    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent("Adapter not loaded")}`
    );
  }

  try {
    const result = await adapter.connect({
      workspaceId: (connection as any).workspace_id,
      code,
      redirect_uri: `${appUrl}/api/integrations/${providerId}/callback`,
    });
    await supabaseAdmin
      .from("integration_connections")
      .update({
        credentials: result.credentials,
        external_account_id: result.external_account_id,
        external_account_name: result.external_account_name,
        status: "connected",
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", (connection as any).id);

    await logAuditEvent({
      action: "integration.connect",
      workspaceId: (connection as any).workspace_id,
      actorKind: "user",
      entityType: "integration_connection",
      entityId: (connection as any).id,
      metadata: { provider: providerId },
      request: req,
    }).catch(() => {});

    return NextResponse.redirect(
      `${settingsUrl}?connected=${encodeURIComponent(providerId)}`
    );
  } catch (err: any) {
    await supabaseAdmin
      .from("integration_connections")
      .update({
        status: "error",
        last_sync_error: err?.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (connection as any).id);
    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent(`${providerId}: ${err?.message}`)}`
    );
  }
}
