// POST /api/custodians/sync
//
// Body: { connectionId: string }
//
// Runs a full refresh for one custodian connection:
//   1. List accounts from the driver (discover new + closed)
//   2. Upsert custodian_accounts
//   3. Snapshot balances + positions for today's date
//   4. Update last_synced_at on the connection
//
// Hitting this manually is fine for the scaffold. A nightly cron will
// call it once per connection per workspace once we go live.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDriver } from "@/lib/custodians";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const wid = profile.workspace_id;

  const body = await req.json().catch(() => ({}));
  const connectionId: string = body?.connectionId;
  if (!connectionId) {
    return NextResponse.json(
      { error: "connectionId required" },
      { status: 400 }
    );
  }

  // Load connection — RLS guards workspace membership on the read.
  const { data: conn, error: connErr } = await supabase
    .from("custodian_connections")
    .select("id, workspace_id, provider")
    .eq("id", connectionId)
    .maybeSingle();
  if (connErr || !conn) {
    return NextResponse.json(
      { error: "Connection not found or access denied" },
      { status: 404 }
    );
  }

  const driver = getDriver(conn.provider);
  if (!driver) {
    return NextResponse.json(
      { error: `No driver registered for provider '${conn.provider}'` },
      { status: 501 }
    );
  }

  const ctx = {
    connectionId: conn.id,
    workspaceId: conn.workspace_id,
    // In production: resolve credentials_vault_ref → actual creds.
    // The mock driver doesn't need any.
    credentials: {},
  };

  try {
    // 1. List accounts
    const accounts = await driver.listAccounts(ctx);
    const accountRows = accounts.map((a) => ({
      workspace_id: wid,
      connection_id: conn.id,
      provider_account_id: a.providerAccountId,
      account_type: a.accountType,
      account_name: a.accountName || null,
      opened_at: a.openedAt || null,
      closed_at: a.closedAt || null,
      updated_at: new Date().toISOString(),
    }));
    await supabaseAdmin
      .from("custodian_accounts")
      .upsert(accountRows, { onConflict: "connection_id,provider_account_id" });

    // 2. Pull fresh account ids back for the snapshot step
    const { data: persistedAccounts } = await supabaseAdmin
      .from("custodian_accounts")
      .select("id, provider_account_id")
      .eq("connection_id", conn.id);
    const idByProvider = new Map<string, string>();
    for (const a of persistedAccounts || []) {
      idByProvider.set(
        (a as any).provider_account_id,
        (a as any).id as string
      );
    }

    // 3. Snapshot
    const today = new Date();
    const isoDate = today.toISOString().slice(0, 10);
    const snaps = await driver.snapshot(
      ctx,
      accounts.map((a) => a.providerAccountId),
      today
    );

    // Clear today's snapshots first so re-running is idempotent.
    const touchedAccountIds = snaps
      .map((s) => idByProvider.get(s.providerAccountId))
      .filter((x): x is string => !!x);
    if (touchedAccountIds.length > 0) {
      await supabaseAdmin
        .from("custodian_balances")
        .delete()
        .eq("as_of", isoDate)
        .in("account_id", touchedAccountIds);
      await supabaseAdmin
        .from("custodian_positions")
        .delete()
        .eq("as_of", isoDate)
        .in("account_id", touchedAccountIds);
    }

    for (const snap of snaps) {
      const accountId = idByProvider.get(snap.providerAccountId);
      if (!accountId) continue;
      await supabaseAdmin.from("custodian_balances").insert({
        account_id: accountId,
        workspace_id: wid,
        as_of: snap.asOf,
        total_value: snap.balance.totalValue,
        cash_value: snap.balance.cashValue ?? null,
        securities_value: snap.balance.securitiesValue ?? null,
      });
      if (snap.positions.length > 0) {
        await supabaseAdmin.from("custodian_positions").insert(
          snap.positions.map((p) => ({
            account_id: accountId,
            workspace_id: wid,
            as_of: snap.asOf,
            symbol: p.symbol,
            description: p.description || null,
            quantity: p.quantity,
            market_value: p.marketValue,
            cost_basis: p.costBasis ?? null,
            unrealized_gain: p.unrealizedGain ?? null,
          }))
        );
      }
    }

    await supabaseAdmin
      .from("custodian_connections")
      .update({
        status: "active",
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", conn.id);

    return NextResponse.json({
      ok: true,
      provider: conn.provider,
      accountsDiscovered: accounts.length,
      snapshotsWritten: snaps.length,
      asOf: isoDate,
    });
  } catch (e: any) {
    await supabaseAdmin
      .from("custodian_connections")
      .update({
        status: "error",
        last_error: String(e?.message || e).slice(0, 500),
      })
      .eq("id", conn.id);
    return NextResponse.json(
      { error: `Sync failed: ${e?.message || e}` },
      { status: 500 }
    );
  }
}
