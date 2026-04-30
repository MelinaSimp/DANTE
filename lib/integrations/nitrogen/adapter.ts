// Nitrogen (Riskalyze) adapter — scaffold.
//
// Pulls per-client risk score + GPA. Validates against the public
// API surface; full mapping confirmed against a live account before
// customer #1. Credentials: { api_key }.

import type {
  ConnectInput,
  ConnectResult,
  ConnectionRow,
  IntegrationAdapter,
  SyncResult,
} from "../adapter";
import { getProvider } from "../registry";

const API_BASE = process.env.NITROGEN_API_BASE || "https://api.nitrogenwealth.com";

async function apiGet(creds: Record<string, any>, path: string): Promise<any> {
  if (!creds.api_key) throw new Error("Nitrogen requires api_key");
  const r = await fetch(API_BASE + path, {
    headers: {
      Authorization: `Bearer ${creds.api_key}`,
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Nitrogen ${path}: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

const adapter: IntegrationAdapter = {
  provider: getProvider("nitrogen")!,

  async connect(input: ConnectInput): Promise<ConnectResult> {
    if (!input.api_key) throw new Error("Nitrogen requires api_key");
    const credentials = { api_key: input.api_key };
    let firmId: string | null = null;
    let firmName: string | null = null;
    try {
      const me = await apiGet(credentials, "/v1/firm");
      firmId = me?.id ? String(me.id) : null;
      firmName = me?.name || null;
    } catch {
      // ignore — record the connection anyway
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
      const j = await apiGet(connection.credentials, "/v1/clients?per_page=100");
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
          "Nitrogen sync failed — adapter scaffolded but not validated against a live account yet.",
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
