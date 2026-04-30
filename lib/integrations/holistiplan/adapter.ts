// Holistiplan adapter — scaffold.
//
// Holistiplan exposes an API but full docs require an active firm
// account. The adapter shape is correct; the path + payload mapping
// is best-guess based on public references and will need a 1-hour
// validation pass against a real account before customer #1.
//
// Credentials: { api_key }   (Bearer token from Account → API)

import type {
  ConnectInput,
  ConnectResult,
  ConnectionRow,
  IntegrationAdapter,
  SyncResult,
} from "../adapter";
import { getProvider } from "../registry";

const API_BASE = process.env.HOLISTIPLAN_API_BASE || "https://api.holistiplan.com";

async function apiGet(creds: Record<string, any>, path: string): Promise<any> {
  if (!creds.api_key) throw new Error("Holistiplan requires api_key");
  const r = await fetch(API_BASE + path, {
    headers: {
      Authorization: `Bearer ${creds.api_key}`,
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Holistiplan ${path}: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

const adapter: IntegrationAdapter = {
  provider: getProvider("holistiplan")!,

  async connect(input: ConnectInput): Promise<ConnectResult> {
    if (!input.api_key) throw new Error("Holistiplan requires api_key");
    const credentials = { api_key: input.api_key };
    // Verify the key by hitting the firm-info endpoint (path is
    // best-guess; will be confirmed against live API).
    let firmName: string | null = null;
    let firmId: string | null = null;
    try {
      const me = await apiGet(credentials, "/v1/firm");
      firmId = me?.id ? String(me.id) : null;
      firmName = me?.name || null;
    } catch {
      // If the path is wrong, we still record the connection so the
      // sync run can surface a clearer error in /integrations.
    }
    return {
      credentials,
      external_account_id: firmId,
      external_account_name: firmName,
    };
  },

  async sync(connection: ConnectionRow): Promise<SyncResult> {
    // Pull tax scenarios. Each scenario links to a client — we map
    // by name + tax_year and write parsed scenarios into
    // dante_memory as kind='fact' so the planning agents can ground
    // recommendations on Holistiplan's analysis.
    let pulled = 0;
    let upserted = 0;
    let errors = 0;

    try {
      const scenarios = await apiGet(
        connection.credentials,
        "/v1/scenarios?per_page=100",
      );
      const list = scenarios?.scenarios || scenarios?.data || [];
      pulled = list.length;
      // Persistence is intentionally no-op until we've validated
      // Holistiplan's response shape against a live account. Writing
      // unvalidated data to dante_memory would pollute the citation
      // store. Surface the count so the UI shows progress.
      upserted = 0;
    } catch (err: any) {
      errors = 1;
      return {
        records_pulled: pulled,
        records_upserted: upserted,
        records_skipped: 0,
        errors_count: errors,
        cursor: connection.sync_state || {},
        error_text:
          err?.message ||
          "Holistiplan sync failed — adapter scaffolded but not validated against a live account yet.",
      };
    }

    return {
      records_pulled: pulled,
      records_upserted: upserted,
      records_skipped: 0,
      errors_count: errors,
      cursor: { last_full_sync_at: new Date().toISOString() },
    };
  },
};

export default adapter;
