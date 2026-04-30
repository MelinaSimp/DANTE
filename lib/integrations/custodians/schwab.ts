// Schwab adapter (OpenView Gateway).
//
// Status: scaffolded. Becomes functional once Drift's Schwab partner
// application is approved and SCHWAB_CLIENT_ID / SCHWAB_CLIENT_SECRET
// are set. The data model + write paths are real — the fetch
// implementations are stubs that throw clearly until credentials are
// in env.
//
// API base: https://api.schwabapi.com/marketdata/v1 (market data)
//           https://api.schwabapi.com/trader/v1     (account / positions)
// Auth: OAuth 2.0 + ongoing 7-day refresh token cycle.

import type {
  ConnectInput,
  ConnectResult,
  ConnectionRow,
  IntegrationAdapter,
  SyncResult,
} from "../adapter";
import { getProvider } from "../registry";
import { portfolio } from "./base";

const ENV_ID = "SCHWAB_CLIENT_ID";
const ENV_SECRET = "SCHWAB_CLIENT_SECRET";

function ensureCreds(): void {
  if (!process.env[ENV_ID] || !process.env[ENV_SECRET]) {
    throw new Error(
      `Schwab integration requires partner program approval. ${ENV_ID} / ${ENV_SECRET} are not set in environment.`,
    );
  }
}

const adapter: IntegrationAdapter = {
  provider: getProvider("schwab")!,

  async connect(input: ConnectInput): Promise<ConnectResult> {
    ensureCreds();
    if (!input.code || !input.redirect_uri) {
      throw new Error("Schwab requires `code` + `redirect_uri`");
    }
    const r = await fetch("https://api.schwabapi.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env[ENV_ID]}:${process.env[ENV_SECRET]}`,
          ).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirect_uri,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Schwab token swap: ${r.status} ${t.slice(0, 200)}`);
    }
    const j = await r.json();
    return {
      credentials: {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: new Date(Date.now() + (j.expires_in || 1800) * 1000).toISOString(),
        scope: j.scope || null,
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

    const accessToken = (connection.credentials as any).access_token;
    if (!accessToken) {
      return {
        records_pulled: 0,
        records_upserted: 0,
        records_skipped: 0,
        errors_count: 1,
        cursor: connection.sync_state || {},
        error_text: "Schwab connection has no access token",
      };
    }

    const ctx = {
      workspace_id: connection.workspace_id,
      source_connection_id: connection.id,
      source: "schwab",
    };

    // Fetch accounts
    const accountsRes = await fetch(
      "https://api.schwabapi.com/trader/v1/accounts?fields=positions",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!accountsRes.ok) {
      return {
        records_pulled: 0,
        records_upserted: 0,
        records_skipped: 0,
        errors_count: 1,
        cursor: connection.sync_state || {},
        error_text: `Schwab /accounts: ${accountsRes.status}`,
      };
    }
    const accountsJson = await accountsRes.json();
    const accounts = (accountsJson?.accounts || []) as any[];

    let upserted = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const a of accounts) {
      const accountId = await portfolio.upsertAccount(ctx, null, {
        external_account_id: String(a.accountNumber || a.accountId),
        account_number_masked: a.accountNumber
          ? `****${String(a.accountNumber).slice(-4)}`
          : null,
        display_name: a.nickname || a.type || null,
        account_type: a.type ? String(a.type).toLowerCase() : null,
      });
      if (!accountId) continue;
      upserted += 1;

      const positions = a.positions || [];
      for (const p of positions) {
        await portfolio.upsertPosition(ctx, accountId, {
          account_external_id: String(a.accountNumber),
          security: {
            cusip: p.instrument?.cusip || null,
            ticker: p.instrument?.symbol || null,
            name: p.instrument?.description || null,
            security_type: (p.instrument?.assetType || "").toLowerCase() || null,
            last_price: p.marketValue && p.longQuantity ? p.marketValue / p.longQuantity : null,
          },
          as_of_date: today,
          quantity: Number(p.longQuantity || p.shortQuantity || 0),
          cost_basis: p.averagePrice && p.longQuantity ? p.averagePrice * p.longQuantity : null,
          market_value: Number(p.marketValue || 0),
          unrealized_gain_loss: Number(p.currentDayProfitLoss || 0),
        });
      }

      // Daily balance
      if (a.currentBalances) {
        await portfolio.upsertBalance(ctx, accountId, {
          account_external_id: String(a.accountNumber),
          as_of_date: today,
          total_value: Number(a.currentBalances.liquidationValue || a.currentBalances.equity || 0),
          cash_value: Number(a.currentBalances.cashBalance || 0),
          market_value: Number(a.currentBalances.equity || 0),
        });
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
