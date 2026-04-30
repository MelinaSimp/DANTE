// RightCapital adapter — scaffold.
//
// OAuth 2.0 with the partner program. Pulls plan summaries (cash
// flow, retirement projection, tax strategy) per client. Adapter
// shape mirrors Wealthbox; URLs come from registry.ts.

import type {
  ConnectInput,
  ConnectResult,
  ConnectionRow,
  IntegrationAdapter,
  SyncResult,
} from "../adapter";
import { getProvider } from "../registry";

const API_BASE = process.env.RIGHTCAPITAL_API_BASE || "https://api.rightcapital.com";

async function tokenSwap(
  code: string,
  redirectUri: string,
): Promise<Record<string, any>> {
  const clientId = process.env.RIGHTCAPITAL_CLIENT_ID;
  const clientSecret = process.env.RIGHTCAPITAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("RIGHTCAPITAL_CLIENT_ID / CLIENT_SECRET not set");
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const r = await fetch(API_BASE + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`RightCapital token swap: ${r.status} ${t}`);
  }
  const j = await r.json();
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    token_type: j.token_type || "Bearer",
    expires_at: j.expires_in
      ? new Date(Date.now() + j.expires_in * 1000).toISOString()
      : null,
  };
}

async function apiGet(
  accessToken: string,
  path: string,
): Promise<any> {
  const r = await fetch(API_BASE + path, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`RightCapital ${path}: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

const adapter: IntegrationAdapter = {
  provider: getProvider("rightcapital")!,

  async connect(input: ConnectInput): Promise<ConnectResult> {
    if (!input.code || !input.redirect_uri) {
      throw new Error("RightCapital requires `code` + `redirect_uri`");
    }
    const credentials = await tokenSwap(input.code, input.redirect_uri);
    let firmId: string | null = null;
    let firmName: string | null = null;
    try {
      const me = await apiGet(credentials.access_token, "/v1/firm");
      firmId = me?.id ? String(me.id) : null;
      firmName = me?.name || null;
    } catch {
      // ignore — connection still recorded
    }
    return {
      credentials,
      external_account_id: firmId,
      external_account_name: firmName,
    };
  },

  async sync(connection: ConnectionRow): Promise<SyncResult> {
    let pulled = 0;
    let errors = 0;
    try {
      const j = await apiGet(
        connection.credentials.access_token,
        "/v1/clients?per_page=100",
      );
      pulled = (j?.clients || j?.data || []).length;
    } catch (err: any) {
      errors = 1;
      return {
        records_pulled: pulled,
        records_upserted: 0,
        records_skipped: 0,
        errors_count: errors,
        cursor: connection.sync_state || {},
        error_text:
          err?.message ||
          "RightCapital sync failed — adapter scaffolded but not validated against a live account yet.",
      };
    }
    return {
      records_pulled: pulled,
      records_upserted: 0,
      records_skipped: 0,
      errors_count: 0,
      cursor: { last_full_sync_at: new Date().toISOString() },
    };
  },
};

export default adapter;
