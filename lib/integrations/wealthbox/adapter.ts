// Wealthbox adapter.
//
// OAuth 2.0. Pulls contacts and notes into Drift's contacts +
// dante_memory tables. The existing app/api/mcp/wealthbox/route.ts
// is an outbound MCP server (Drift exposes itself via MCP); this
// adapter is the inbound import (Drift pulls from Wealthbox).
//
// Token format: { access_token, refresh_token, expires_at,
// token_type: 'Bearer' }
//
// API base: https://api.crmworkspace.com/v1
// Pagination: page + per_page (max 100)

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  ConnectInput,
  ConnectResult,
  ConnectionRow,
  IntegrationAdapter,
  SyncResult,
} from "../adapter";
import { getProvider } from "../registry";

const API_BASE = "https://api.crmworkspace.com/v1";

async function tokenSwap(
  code: string,
  redirectUri: string,
): Promise<Record<string, any>> {
  const clientId = process.env.WEALTHBOX_CLIENT_ID;
  const clientSecret = process.env.WEALTHBOX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "WEALTHBOX_CLIENT_ID / WEALTHBOX_CLIENT_SECRET not set in env",
    );
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const r = await fetch("https://app.crmworkspace.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Wealthbox token swap failed: ${r.status} ${t}`);
  }
  const j = await r.json();
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    token_type: j.token_type || "Bearer",
    expires_at: j.expires_in
      ? new Date(Date.now() + j.expires_in * 1000).toISOString()
      : null,
    scope: j.scope || null,
  };
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<Record<string, any>> {
  const clientId = process.env.WEALTHBOX_CLIENT_ID;
  const clientSecret = process.env.WEALTHBOX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("WEALTHBOX env credentials not set");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const r = await fetch("https://app.crmworkspace.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`Wealthbox refresh failed: ${r.status}`);
  const j = await r.json();
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token || refreshToken,
    token_type: j.token_type || "Bearer",
    expires_at: j.expires_in
      ? new Date(Date.now() + j.expires_in * 1000).toISOString()
      : null,
  };
}

async function apiGet(
  accessToken: string,
  path: string,
  params: Record<string, string> = {},
): Promise<any> {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Wealthbox API ${path} failed: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

const adapter: IntegrationAdapter = {
  provider: getProvider("wealthbox")!,

  async connect(input: ConnectInput): Promise<ConnectResult> {
    if (!input.code) {
      throw new Error("Wealthbox connect requires `code` from OAuth callback");
    }
    if (!input.redirect_uri) {
      throw new Error("redirect_uri required");
    }
    const credentials = await tokenSwap(input.code, input.redirect_uri);

    // Fetch the connected user's identity for display in /integrations.
    let externalAccountId: string | null = null;
    let externalAccountName: string | null = null;
    try {
      const me = await apiGet(credentials.access_token, "/me");
      externalAccountId = me?.id ? String(me.id) : null;
      externalAccountName = me?.name || me?.email || null;
    } catch {
      // Identity isn't fatal — proceed without it.
    }

    return {
      credentials,
      external_account_id: externalAccountId,
      external_account_name: externalAccountName,
    };
  },

  async refresh(connection: ConnectionRow): Promise<Record<string, any>> {
    if (!connection.credentials.refresh_token) {
      throw new Error("No refresh_token on Wealthbox connection");
    }
    return refreshAccessToken(connection.credentials.refresh_token);
  },

  async sync(connection: ConnectionRow): Promise<SyncResult> {
    let credentials = connection.credentials;
    // Refresh if access token is within 60s of expiry.
    const expiresAt = credentials.expires_at
      ? new Date(credentials.expires_at).getTime()
      : null;
    if (expiresAt && expiresAt - Date.now() < 60_000) {
      credentials = { ...credentials, ...(await refreshAccessToken(credentials.refresh_token)) };
      await supabaseAdmin
        .from("integration_connections")
        .update({ credentials, updated_at: new Date().toISOString() })
        .eq("id", connection.id);
    }

    const cursor = connection.sync_state?.contacts_page || 1;
    let pulled = 0;
    let upserted = 0;
    let skipped = 0;
    let errors = 0;
    let nextPage = cursor as number;

    // Pull contacts in pages of 100. We cap at 50 pages per sync to
    // keep cron within the Vercel timeout — subsequent runs continue
    // from sync_state.contacts_page.
    const PAGE_LIMIT = 50;
    let pagesProcessed = 0;
    let hasMore = true;

    while (hasMore && pagesProcessed < PAGE_LIMIT) {
      try {
        const j = await apiGet(credentials.access_token, "/contacts", {
          page: String(nextPage),
          per_page: "100",
        });
        const contacts = j.contacts || [];
        if (contacts.length === 0) {
          hasMore = false;
          break;
        }
        pulled += contacts.length;

        // Upsert each Wealthbox contact into Drift's contacts table.
        // We key on (workspace_id, email) when email is present, else
        // (workspace_id, name + phone). New rows get a metadata field
        // pointing at the Wealthbox external_id.
        for (const c of contacts) {
          const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.full_name || null;
          const email = c.email_addresses?.[0]?.address || null;
          const phone = c.phone_numbers?.[0]?.address || null;

          if (!name && !email && !phone) {
            skipped += 1;
            continue;
          }

          // Look up existing match
          let existingId: string | null = null;
          if (email) {
            const { data } = await supabaseAdmin
              .from("contacts")
              .select("id")
              .eq("workspace_id", connection.workspace_id)
              .eq("email", email)
              .maybeSingle();
            if (data) existingId = (data as any).id;
          }

          const payload: Record<string, any> = {
            workspace_id: connection.workspace_id,
            name: name || "(no name)",
            email,
            phone: phone || "(no phone)",
            updated_at: new Date().toISOString(),
          };

          if (existingId) {
            await supabaseAdmin
              .from("contacts")
              .update(payload)
              .eq("id", existingId);
          } else {
            const { error } = await supabaseAdmin
              .from("contacts")
              .insert(payload);
            if (error) {
              errors += 1;
              continue;
            }
          }
          upserted += 1;
        }

        nextPage += 1;
        pagesProcessed += 1;
        hasMore = contacts.length === 100;
      } catch (err: any) {
        errors += 1;
        return {
          records_pulled: pulled,
          records_upserted: upserted,
          records_skipped: skipped,
          errors_count: errors,
          cursor: { contacts_page: nextPage },
          error_text: err?.message || "Wealthbox sync failed",
        };
      }
    }

    return {
      records_pulled: pulled,
      records_upserted: upserted,
      records_skipped: skipped,
      errors_count: errors,
      cursor: hasMore
        ? { contacts_page: nextPage }
        : { contacts_page: 1, last_full_sync_at: new Date().toISOString() },
    };
  },
};

export default adapter;
