// Redtail CRM adapter.
//
// Uses the API key + user/pass Basic-auth model documented at
// help.redtailtechnology.com. Pulls contacts (with phones, emails)
// into Drift's contacts table.
//
// Credentials shape: { api_key, username, password }
// API base: https://crm.redtailtechnology.com/api/public/v1
// Auth header: `Basic base64(api_key:username:password)` (Redtail's variant)

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  ConnectInput,
  ConnectResult,
  ConnectionRow,
  IntegrationAdapter,
  SyncResult,
} from "../adapter";
import { getProvider } from "../registry";

const API_BASE = "https://crm.redtailtechnology.com/api/public/v1";

function authHeader(creds: Record<string, any>): string {
  const { api_key, username, password } = creds;
  if (!api_key || !username || !password) {
    throw new Error("Redtail requires api_key + username + password");
  }
  const b64 = Buffer.from(`${api_key}:${username}:${password}`).toString("base64");
  return `Basic ${b64}`;
}

async function apiGet(
  creds: Record<string, any>,
  path: string,
  params: Record<string, string> = {},
): Promise<any> {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), {
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
      "Include": "phones,emails,addresses",
    },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Redtail API ${path} failed: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

const adapter: IntegrationAdapter = {
  provider: getProvider("redtail")!,

  async connect(input: ConnectInput): Promise<ConnectResult> {
    if (!input.api_key || !input.username || !input.password) {
      throw new Error("Redtail connect requires api_key + username + password");
    }
    const credentials = {
      api_key: input.api_key,
      username: input.username,
      password: input.password,
    };
    // Test the credentials by calling /me (Redtail's user info).
    let externalAccountId: string | null = null;
    let externalAccountName: string | null = null;
    try {
      const me = await apiGet(credentials, "/me");
      externalAccountId = me?.user?.id ? String(me.user.id) : null;
      externalAccountName = me?.user?.name || me?.user?.email || null;
    } catch (err: any) {
      throw new Error(`Redtail authentication failed: ${err?.message}`);
    }
    return {
      credentials,
      external_account_id: externalAccountId,
      external_account_name: externalAccountName,
    };
  },

  async sync(connection: ConnectionRow): Promise<SyncResult> {
    let pulled = 0;
    let upserted = 0;
    let skipped = 0;
    let errors = 0;

    const cursor = (connection.sync_state?.contacts_page as number) || 1;
    let nextPage = cursor;
    let hasMore = true;
    const PAGE_LIMIT = 50;
    let pagesProcessed = 0;

    while (hasMore && pagesProcessed < PAGE_LIMIT) {
      try {
        const j = await apiGet(connection.credentials, "/contacts", {
          page: String(nextPage),
          per_page: "100",
        });
        const contacts = j.contacts || j.data || [];
        if (contacts.length === 0) {
          hasMore = false;
          break;
        }
        pulled += contacts.length;

        for (const c of contacts) {
          const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.name || null;
          const email =
            c.emails?.[0]?.address ||
            c.email_addresses?.[0]?.address ||
            null;
          const phone =
            c.phones?.[0]?.number ||
            c.phone_numbers?.[0]?.number ||
            null;

          if (!name && !email && !phone) {
            skipped += 1;
            continue;
          }

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

          const payload = {
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
            const { error } = await supabaseAdmin.from("contacts").insert(payload);
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
          error_text: err?.message || "Redtail sync failed",
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
