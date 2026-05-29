// GET /api/integrations/salesforce/callback?code=...&state=<connection_id>
//
// Salesforce-specific OAuth callback. Receives the authorization code
// from Salesforce's redirect, exchanges it for tokens via the adapter's
// connect() method, stores credentials on the connection row, and
// redirects back to /settings/integrations.
//
// This takes precedence over the generic [provider]/callback route for
// Salesforce connections, keeping Salesforce-specific concerns isolated.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/integrations/adapter";
import { getAppUrl } from "@/lib/app-url";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

const PROVIDER_ID = "salesforce";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // connection_id
  const errorParam = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  const appUrl = getAppUrl();
  const settingsUrl = `${appUrl}/settings/integrations`;

  // Handle Salesforce error responses (user denied, admin pre-approval, etc.).
  if (errorParam) {
    const message = errorDesc
      ? `${PROVIDER_ID}: ${errorParam} - ${errorDesc}`
      : `${PROVIDER_ID}: ${errorParam}`;
    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent(message)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent("Missing code or state from Salesforce")}`,
    );
  }

  // Look up the pending connection row (state = connection_id).
  const { data: connection } = await supabaseAdmin
    .from("integration_connections")
    .select("id, workspace_id, provider")
    .eq("id", state)
    .eq("provider", PROVIDER_ID)
    .maybeSingle();

  if (!connection) {
    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent("Unknown connection state for Salesforce")}`,
    );
  }

  const adapter = await getAdapter(PROVIDER_ID);
  if (!adapter) {
    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent("Salesforce adapter not loaded")}`,
    );
  }

  try {
    const result = await adapter.connect({
      workspaceId: (connection as any).workspace_id,
      code,
      redirect_uri: `${appUrl}/api/integrations/${PROVIDER_ID}/callback`,
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
      metadata: { provider: PROVIDER_ID },
      request: req,
    }).catch(() => {});

    return NextResponse.redirect(
      `${settingsUrl}?connected=${encodeURIComponent(PROVIDER_ID)}`,
    );
  } catch (err: any) {
    console.error("[salesforce-callback] connect failed:", err?.message);

    await supabaseAdmin
      .from("integration_connections")
      .update({
        status: "error",
        last_sync_error: err?.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (connection as any).id);

    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent(`${PROVIDER_ID}: ${err?.message}`)}`,
    );
  }
}
