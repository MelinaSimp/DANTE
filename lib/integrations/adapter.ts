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
  // ── CRE integrations ──
  // API-key providers use the generic stub that stores the key.
  // OAuth providers use the OAuth stub. Partner-pending use partner stub.
  yardi: async () => (await import("./_api-key-stub")).makeApiKeyStub("yardi"),
  yardi_breeze: async () => (await import("./_api-key-stub")).makeApiKeyStub("yardi_breeze"),
  appfolio: async () => (await import("./_api-key-stub")).makeApiKeyStub("appfolio"),
  realpage: async () => (await import("./_api-key-stub")).makeApiKeyStub("realpage"),
  entrata: async () => (await import("./_api-key-stub")).makeApiKeyStub("entrata"),
  mri_software: async () => (await import("./_api-key-stub")).makeApiKeyStub("mri_software"),
  buildium: async () => (await import("./_api-key-stub")).makeApiKeyStub("buildium"),
  quickbooks: async () => (await import("./_oauth-stub")).makeOAuthStub("quickbooks"),
  sage_intacct: async () => (await import("./_api-key-stub")).makeApiKeyStub("sage_intacct"),
  netsuite: async () => (await import("./_api-key-stub")).makeApiKeyStub("netsuite"),
  xero: async () => (await import("./_oauth-stub")).makeOAuthStub("xero"),
  salesforce: async () => (await import("./_oauth-stub")).makeOAuthStub("salesforce"),
  hubspot: async () => (await import("./_api-key-stub")).makeApiKeyStub("hubspot"),
  apto: async () => (await import("./_api-key-stub")).makeApiKeyStub("apto"),
  buildout: async () => (await import("./_api-key-stub")).makeApiKeyStub("buildout"),
  dealpath: async () => (await import("./_api-key-stub")).makeApiKeyStub("dealpath"),
  juniper_square: async () => (await import("./_api-key-stub")).makeApiKeyStub("juniper_square"),
  northspyre: async () => (await import("./_api-key-stub")).makeApiKeyStub("northspyre"),
  costar: async () => (await import("./_api-key-stub")).makeApiKeyStub("costar"),
  crexi: async () => (await import("./_api-key-stub")).makeApiKeyStub("crexi"),
  reonomy: async () => (await import("./_api-key-stub")).makeApiKeyStub("reonomy"),
  placer_ai: async () => (await import("./_api-key-stub")).makeApiKeyStub("placer_ai"),
  yardi_matrix: async () => (await import("./_api-key-stub")).makeApiKeyStub("yardi_matrix"),
  rca: async () => (await import("./_api-key-stub")).makeApiKeyStub("rca"),
  docusign: async () => (await import("./_oauth-stub")).makeOAuthStub("docusign"),
  pandadoc: async () => (await import("./_api-key-stub")).makeApiKeyStub("pandadoc"),
  zoominfo: async () => (await import("./_api-key-stub")).makeApiKeyStub("zoominfo"),
  apollo: async () => (await import("./_api-key-stub")).makeApiKeyStub("apollo"),
  linkedin_sales_nav: async () => (await import("./_partner-stub")).makeStub("linkedin_sales_nav"),
  auction_com: async () => (await import("./_api-key-stub")).makeApiKeyStub("auction_com"),
  ten_x: async () => (await import("./_api-key-stub")).makeApiKeyStub("ten_x"),
  regrid: async () => (await import("./_api-key-stub")).makeApiKeyStub("regrid"),
  google_maps: async () => (await import("./_api-key-stub")).makeApiKeyStub("google_maps"),
  opencorporates: async () => (await import("./_api-key-stub")).makeApiKeyStub("opencorporates"),
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
