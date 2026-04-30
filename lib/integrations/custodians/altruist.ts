// Altruist adapter.
//
// Public REST API; partner approval lighter than legacy custodians.
// Status: scaffolded — real shape, errors clearly when
// ALTRUIST_CLIENT_ID / ALTRUIST_CLIENT_SECRET aren't set.
//
// API base: https://api.altruist.com
// Auth: OAuth 2.0 client credentials.

import type {
  ConnectInput,
  ConnectResult,
  ConnectionRow,
  IntegrationAdapter,
  SyncResult,
} from "../adapter";
import { getProvider } from "../registry";
import { portfolio } from "./base";

function ensureCreds(): void {
  if (!process.env.ALTRUIST_CLIENT_ID || !process.env.ALTRUIST_CLIENT_SECRET) {
    throw new Error(
      "Altruist integration requires ALTRUIST_CLIENT_ID / ALTRUIST_CLIENT_SECRET in env. Reach out to Altruist's API team to register your app.",
    );
  }
}

const adapter: IntegrationAdapter = {
  provider: getProvider("altruist")!,

  async connect(input: ConnectInput): Promise<ConnectResult> {
    ensureCreds();
    if (!input.code || !input.redirect_uri) {
      throw new Error("Altruist requires `code` + `redirect_uri`");
    }
    const r = await fetch("https://api.altruist.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirect_uri,
        client_id: process.env.ALTRUIST_CLIENT_ID!,
        client_secret: process.env.ALTRUIST_CLIENT_SECRET!,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Altruist token swap: ${r.status} ${t.slice(0, 200)}`);
    }
    const j = await r.json();
    return {
      credentials: {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: j.expires_in
          ? new Date(Date.now() + j.expires_in * 1000).toISOString()
          : null,
      },
      external_account_id: null,
      external_account_name: null,
    };
  },

  async sync(connection: ConnectionRow): Promise<SyncResult> {
    try {
      ensureCreds();
    } catch (err: any) {
      return {
        records_pulled: 0,
        records_upserted: 0,
        records_skipped: 0,
        errors_count: 0,
        cursor: connection.sync_state || {},
        error_text: err.message,
      };
    }
    const token = (connection.credentials as any).access_token;
    if (!token) {
      return {
        records_pulled: 0,
        records_upserted: 0,
        records_skipped: 0,
        errors_count: 1,
        cursor: {},
        error_text: "Altruist connection missing access_token",
      };
    }
    const ctx = {
      workspace_id: connection.workspace_id,
      source_connection_id: connection.id,
      source: "altruist",
    };
    const today = new Date().toISOString().slice(0, 10);

    const r = await fetch("https://api.altruist.com/v1/accounts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      return {
        records_pulled: 0,
        records_upserted: 0,
        records_skipped: 0,
        errors_count: 1,
        cursor: connection.sync_state || {},
        error_text: `Altruist /accounts: ${r.status}`,
      };
    }
    const j = await r.json();
    const accounts = (j?.data || j?.accounts || []) as any[];
    let upserted = 0;

    for (const a of accounts) {
      const accountId = await portfolio.upsertAccount(ctx, null, {
        external_account_id: String(a.id),
        account_number_masked: a.account_number
          ? `****${String(a.account_number).slice(-4)}`
          : null,
        display_name: a.title || a.name || null,
        account_type: a.account_type || null,
        registration: a.registration || null,
      });
      if (accountId) {
        upserted += 1;
        if (a.balance) {
          await portfolio.upsertBalance(ctx, accountId, {
            account_external_id: String(a.id),
            as_of_date: today,
            total_value: Number(a.balance.total || 0),
            cash_value: Number(a.balance.cash || 0),
            market_value: Number(a.balance.market_value || 0),
          });
        }
      }
    }

    return {
      records_pulled: accounts.length,
      records_upserted: upserted,
      records_skipped: 0,
      errors_count: 0,
      cursor: { last_full_sync_at: new Date().toISOString() },
    };
  },
};

export default adapter;
