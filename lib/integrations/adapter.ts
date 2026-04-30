// Adapter interface every integration implements.
//
// Two phases of work per provider:
//
//   1. CONNECT — exchange user-supplied credentials (OAuth code,
//      API key + user/pass) for a long-lived token stored in
//      integration_connections.credentials. Returns the external
//      account id for display.
//
//   2. SYNC   — given a connection row, pull what the registry
//      capabilities promised (contacts, accounts, plans, etc.)
//      and upsert into Drift's tables. Update sync_state cursors
//      on the connection row.
//
// Adapters are workspace-scoped — they always receive the
// connection row and write only into that workspace.

import type { ProviderDefinition } from "./registry";

export interface ConnectionRow {
  id: string;
  workspace_id: string;
  provider: string;
  credentials: Record<string, any>;
  external_account_id: string | null;
  external_account_name: string | null;
  sync_state: Record<string, any>;
}

export interface ConnectInput {
  workspaceId: string;
  // OAuth callbacks pass `code`. API-key adapters pass `api_key`
  // (and optionally username/password for Basic-auth providers).
  code?: string;
  api_key?: string;
  username?: string;
  password?: string;
  redirect_uri?: string;
}

export interface ConnectResult {
  credentials: Record<string, any>;
  external_account_id: string | null;
  external_account_name: string | null;
}

export interface SyncResult {
  records_pulled: number;
  records_upserted: number;
  records_skipped: number;
  errors_count: number;
  cursor: Record<string, any>;
  error_text?: string;
}

export interface IntegrationAdapter {
  provider: ProviderDefinition;
  /** Exchange user-supplied auth for stored credentials. */
  connect(input: ConnectInput): Promise<ConnectResult>;
  /** Pull data and upsert into Drift. */
  sync(connection: ConnectionRow): Promise<SyncResult>;
  /** Refresh OAuth tokens if applicable. Default no-op. */
  refresh?(connection: ConnectionRow): Promise<Record<string, any>>;
}

// Adapter registry. Lazy-imported per provider so a misconfigured
// provider doesn't crash boot.
const ADAPTERS: Record<string, () => Promise<IntegrationAdapter>> = {
  wealthbox: async () => (await import("./wealthbox/adapter")).default,
  redtail: async () => (await import("./redtail/adapter")).default,
  holistiplan: async () => (await import("./holistiplan/adapter")).default,
  nitrogen: async () => (await import("./nitrogen/adapter")).default,
  rightcapital: async () => (await import("./rightcapital/adapter")).default,
  // Phase 5 — return a stub adapter that throws "partner approval required".
  schwab: async () => (await import("./_partner-stub")).makeStub("schwab"),
  fidelity: async () => (await import("./_partner-stub")).makeStub("fidelity"),
  pershing: async () => (await import("./_partner-stub")).makeStub("pershing"),
  altruist: async () => (await import("./_partner-stub")).makeStub("altruist"),
  orion: async () => (await import("./_partner-stub")).makeStub("orion"),
  tamarac: async () => (await import("./_partner-stub")).makeStub("tamarac"),
  addepar: async () => (await import("./_partner-stub")).makeStub("addepar"),
  black_diamond: async () => (await import("./_partner-stub")).makeStub("black_diamond"),
  morningstar: async () => (await import("./_partner-stub")).makeStub("morningstar"),
  ycharts: async () => (await import("./_partner-stub")).makeStub("ycharts"),
  cch: async () => (await import("./_partner-stub")).makeStub("cch"),
  salesforce_fs_cloud: async () =>
    (await import("./_partner-stub")).makeStub("salesforce_fs_cloud"),
};

export async function getAdapter(
  provider: string,
): Promise<IntegrationAdapter | null> {
  const factory = ADAPTERS[provider];
  if (!factory) return null;
  try {
    return await factory();
  } catch (err) {
    console.error(`[integrations] failed to load adapter '${provider}':`, err);
    return null;
  }
}
