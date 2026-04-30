// Custodian adapter base.
//
// All custodian adapters (Schwab, Fidelity, Pershing, Altruist) share
// the same write paths into the portfolio data model. Each provider's
// adapter calls fetch*() to pull from its API, then hands the
// normalized rows to upsertAccount / upsertPosition / upsertTransaction.
//
// Provider-specific work is the API call + the shape mapping. The
// schema commitment + RLS + idempotency live here.

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface NormalizedAccount {
  external_account_id: string;
  account_number_masked?: string | null;
  display_name?: string | null;
  account_type?: string | null;        // 'traditional_ira' | 'roth_ira' | 'taxable' | ...
  registration?: string | null;
  is_discretionary?: boolean;
  metadata?: Record<string, unknown>;
}

export interface NormalizedSecurity {
  cusip?: string | null;
  isin?: string | null;
  ticker?: string | null;
  symbol_id?: string | null;
  name?: string | null;
  asset_class?: string | null;
  security_type?: string | null;       // 'equity' | 'etf' | 'mutual_fund' | ...
  exchange?: string | null;
  expense_ratio?: number | null;
  last_price?: number | null;
}

export interface NormalizedPosition {
  account_external_id: string;
  security: NormalizedSecurity;
  as_of_date: string;                  // YYYY-MM-DD
  quantity: number;
  cost_basis?: number | null;
  market_value?: number | null;
  unrealized_gain_loss?: number | null;
  short_term_gain_loss?: number | null;
  long_term_gain_loss?: number | null;
}

export interface NormalizedTransaction {
  account_external_id: string;
  external_transaction_id: string;
  security?: NormalizedSecurity | null;
  trade_date: string;
  settle_date?: string | null;
  transaction_type: string;
  description?: string | null;
  quantity?: number | null;
  price?: number | null;
  amount?: number | null;
  fees?: number | null;
  cost_basis?: number | null;
  realized_gain_loss?: number | null;
  short_or_long?: "short" | "long" | null;
}

export interface NormalizedBalance {
  account_external_id: string;
  as_of_date: string;
  total_value: number;
  cash_value?: number | null;
  market_value?: number | null;
  pending_activity?: number | null;
}

interface UpsertContext {
  workspace_id: string;
  source_connection_id: string;
  source: string;
}

async function upsertSecurity(
  ctx: UpsertContext,
  s: NormalizedSecurity,
): Promise<string | null> {
  if (!s.cusip && !s.ticker && !s.symbol_id) return null;

  // Match by CUSIP first (most stable), then ticker.
  const matchKeys: Array<[string, string]> = [];
  if (s.cusip) matchKeys.push(["cusip", s.cusip]);
  if (s.ticker) matchKeys.push(["ticker", s.ticker]);

  for (const [col, val] of matchKeys) {
    const { data: existing } = await supabaseAdmin
      .from("security_master")
      .select("id")
      .eq("workspace_id", ctx.workspace_id)
      .eq(col, val)
      .maybeSingle();
    if (existing) {
      // Patch if we have richer data this time
      await supabaseAdmin
        .from("security_master")
        .update({
          name: s.name ?? null,
          asset_class: s.asset_class ?? null,
          security_type: s.security_type ?? null,
          last_price: s.last_price ?? null,
          last_price_at: s.last_price ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (existing as any).id);
      return (existing as any).id;
    }
  }

  const { data: created, error } = await supabaseAdmin
    .from("security_master")
    .insert({
      workspace_id: ctx.workspace_id,
      source_connection_id: ctx.source_connection_id,
      source: ctx.source,
      cusip: s.cusip || null,
      isin: s.isin || null,
      ticker: s.ticker || null,
      symbol_id: s.symbol_id || null,
      name: s.name || null,
      asset_class: s.asset_class || null,
      security_type: s.security_type || null,
      exchange: s.exchange || null,
      expense_ratio: s.expense_ratio || null,
      last_price: s.last_price || null,
      last_price_at: s.last_price ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[custodian.security] upsert failed:", error.message);
    return null;
  }
  return (created as any).id;
}

async function upsertAccount(
  ctx: UpsertContext,
  contactId: string | null,
  acct: NormalizedAccount,
): Promise<string | null> {
  const payload = {
    workspace_id: ctx.workspace_id,
    contact_id: contactId,
    source_connection_id: ctx.source_connection_id,
    source: ctx.source,
    external_account_id: acct.external_account_id,
    account_number_masked: acct.account_number_masked || null,
    display_name: acct.display_name || null,
    account_type: acct.account_type || null,
    registration: acct.registration || null,
    is_discretionary: acct.is_discretionary !== false,
    metadata: acct.metadata || {},
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from("portfolio_accounts")
    .upsert(payload, { onConflict: "source_connection_id,external_account_id" })
    .select("id")
    .single();
  if (error) {
    console.error("[custodian.account] upsert failed:", error.message);
    return null;
  }
  return (data as any).id;
}

async function upsertPosition(
  ctx: UpsertContext,
  accountId: string,
  pos: NormalizedPosition,
): Promise<void> {
  const securityId = await upsertSecurity(ctx, pos.security);
  await supabaseAdmin
    .from("portfolio_positions")
    .upsert(
      {
        workspace_id: ctx.workspace_id,
        account_id: accountId,
        security_id: securityId,
        source_connection_id: ctx.source_connection_id,
        as_of_date: pos.as_of_date,
        quantity: pos.quantity,
        cost_basis: pos.cost_basis ?? null,
        market_value: pos.market_value ?? null,
        unrealized_gain_loss: pos.unrealized_gain_loss ?? null,
        short_term_gain_loss: pos.short_term_gain_loss ?? null,
        long_term_gain_loss: pos.long_term_gain_loss ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,security_id,as_of_date" },
    );
}

async function upsertTransaction(
  ctx: UpsertContext,
  accountId: string,
  tx: NormalizedTransaction,
): Promise<void> {
  const securityId = tx.security ? await upsertSecurity(ctx, tx.security) : null;
  await supabaseAdmin
    .from("portfolio_transactions")
    .upsert(
      {
        workspace_id: ctx.workspace_id,
        account_id: accountId,
        security_id: securityId,
        source_connection_id: ctx.source_connection_id,
        external_transaction_id: tx.external_transaction_id,
        trade_date: tx.trade_date,
        settle_date: tx.settle_date || null,
        transaction_type: tx.transaction_type,
        description: tx.description || null,
        quantity: tx.quantity ?? null,
        price: tx.price ?? null,
        amount: tx.amount ?? null,
        fees: tx.fees ?? null,
        cost_basis: tx.cost_basis ?? null,
        realized_gain_loss: tx.realized_gain_loss ?? null,
        short_or_long: tx.short_or_long ?? null,
      },
      { onConflict: "source_connection_id,external_transaction_id" },
    );
}

async function upsertBalance(
  ctx: UpsertContext,
  accountId: string,
  bal: NormalizedBalance,
): Promise<void> {
  await supabaseAdmin
    .from("portfolio_balances")
    .upsert(
      {
        workspace_id: ctx.workspace_id,
        account_id: accountId,
        source_connection_id: ctx.source_connection_id,
        as_of_date: bal.as_of_date,
        total_value: bal.total_value,
        cash_value: bal.cash_value ?? 0,
        market_value: bal.market_value ?? 0,
        pending_activity: bal.pending_activity ?? 0,
      },
      { onConflict: "account_id,as_of_date" },
    );
}

export const portfolio = {
  upsertAccount,
  upsertPosition,
  upsertTransaction,
  upsertBalance,
  upsertSecurity,
};
