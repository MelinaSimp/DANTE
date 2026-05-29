// lib/integrations/adapters/salesforce.ts
//
// Real Salesforce integration adapter.
//
// Connect: exchanges OAuth authorization code for access_token +
//          refresh_token via Salesforce's token endpoint.
// Sync:    pulls Contacts via SOQL, upserts into Drift's contacts
//          table using email as the dedup key.
// Refresh: uses refresh_token to obtain a new access_token.

import type {
  IntegrationAdapter,
  ConnectInput,
  ConnectResult,
  SyncResult,
  ConnectionRow,
} from "../adapter";
import { getProvider } from "../registry";
import { supabaseAdmin } from "@/lib/supabase/admin";

const PROVIDER_ID = "salesforce";

// Salesforce REST API version — update as needed.
const SF_API_VERSION = "v59.0";

// Salesforce returns max 2000 records per query result.
const SF_PAGE_SIZE = 2000;

// Rate-limit: pause between paginated requests to stay under
// Salesforce's ~100 requests / 15 seconds limit.
const RATE_LIMIT_DELAY_MS = 200;

// ---------------------------------------------------------------------------
// Helper: authenticated fetch against a Salesforce instance
// ---------------------------------------------------------------------------

interface SfFetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

async function sfFetch(
  instanceUrl: string,
  path: string,
  accessToken: string,
  opts: SfFetchOptions = {},
): Promise<Response> {
  const url = path.startsWith("http")
    ? path // nextRecordsUrl is already absolute
    : `${instanceUrl}${path}`;

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
    body: opts.body,
    signal: AbortSignal.timeout(30_000),
  });

  return res;
}

// ---------------------------------------------------------------------------
// Token exchange helpers
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  instance_url: string;
  issued_at: string;
  id: string; // identity URL
  token_type: string;
}

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET must be set in environment variables.",
    );
  }

  const res = await fetch("https://login.salesforce.com/services/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Salesforce token exchange failed (HTTP ${res.status}): ${text}`,
    );
  }

  return (await res.json()) as TokenResponse;
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; issued_at: string }> {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET must be set.",
    );
  }

  const res = await fetch("https://login.salesforce.com/services/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Salesforce token refresh failed (HTTP ${res.status}): ${text}`,
    );
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    issued_at: data.issued_at,
  };
}

// ---------------------------------------------------------------------------
// Fetch org name from Salesforce identity endpoint
// ---------------------------------------------------------------------------

async function fetchOrgName(
  instanceUrl: string,
  accessToken: string,
): Promise<string> {
  try {
    const res = await sfFetch(
      instanceUrl,
      `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(
        "SELECT Name FROM Organization LIMIT 1",
      )}`,
      accessToken,
    );
    if (res.ok) {
      const data = await res.json();
      if (data.records?.[0]?.Name) {
        return data.records[0].Name as string;
      }
    }
  } catch {
    // Non-fatal — fall back to instance URL.
  }
  // Strip protocol for a readable fallback.
  return instanceUrl.replace(/^https?:\/\//, "");
}

// ---------------------------------------------------------------------------
// Sync helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SfContact {
  Id: string;
  FirstName: string | null;
  LastName: string | null;
  Email: string | null;
  Phone: string | null;
  Account?: { Name: string | null } | null;
  LastModifiedDate: string;
}

interface SfQueryResult {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: SfContact[];
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

function makeSalesforceAdapter(): IntegrationAdapter {
  const provider = getProvider(PROVIDER_ID);
  if (!provider) throw new Error(`Unknown provider '${PROVIDER_ID}'`);

  return {
    provider,

    // ------------------------------------------------------------------
    // CONNECT
    // ------------------------------------------------------------------
    async connect(input: ConnectInput): Promise<ConnectResult> {
      if (!input.code) {
        throw new Error("OAuth authorization code is required");
      }
      if (!input.redirect_uri) {
        throw new Error("redirect_uri is required for the Salesforce token exchange");
      }

      const tokens = await exchangeCodeForTokens(input.code, input.redirect_uri);
      const orgName = await fetchOrgName(tokens.instance_url, tokens.access_token);

      return {
        credentials: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          instance_url: tokens.instance_url,
          issued_at: tokens.issued_at,
        },
        external_account_id: tokens.instance_url,
        external_account_name: orgName,
      };
    },

    // ------------------------------------------------------------------
    // SYNC — pull Contacts via SOQL, upsert into Drift contacts table
    // ------------------------------------------------------------------
    async sync(connection: ConnectionRow): Promise<SyncResult> {
      const creds = connection.credentials;
      let accessToken = creds.access_token as string;
      const refreshToken = creds.refresh_token as string | null;
      const instanceUrl = creds.instance_url as string;

      if (!accessToken || !instanceUrl) {
        return {
          records_pulled: 0,
          records_upserted: 0,
          records_skipped: 0,
          errors_count: 1,
          cursor: connection.sync_state ?? {},
          error_text: "Missing access_token or instance_url in stored credentials.",
        };
      }

      // Determine the cursor for incremental sync.
      const lastModified = (connection.sync_state?.last_modified_date as string) ?? null;

      // Build SOQL query — pull all contacts, or only those modified
      // since the last sync.
      let soql =
        "SELECT Id, FirstName, LastName, Email, Phone, Account.Name, LastModifiedDate " +
        "FROM Contact";
      if (lastModified) {
        soql += ` WHERE LastModifiedDate > ${lastModified}`;
      }
      soql += " ORDER BY LastModifiedDate ASC";

      let totalPulled = 0;
      let totalUpserted = 0;
      let totalSkipped = 0;
      let totalErrors = 0;
      let newestModified = lastModified;
      let nextUrl: string | null =
        `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(soql)}`;

      // Paginate through results.
      while (nextUrl) {
        // Attempt the request; if 401, try refreshing the token once.
        let res = await sfFetch(instanceUrl, nextUrl, accessToken);

        if (res.status === 401 && refreshToken) {
          try {
            const refreshed = await refreshAccessToken(refreshToken);
            accessToken = refreshed.access_token;

            // Persist the refreshed token.
            await supabaseAdmin
              .from("integration_connections")
              .update({
                credentials: {
                  ...creds,
                  access_token: accessToken,
                  issued_at: refreshed.issued_at,
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", connection.id);

            // Retry the request with new token.
            res = await sfFetch(instanceUrl, nextUrl, accessToken);
          } catch (refreshErr: any) {
            return {
              records_pulled: totalPulled,
              records_upserted: totalUpserted,
              records_skipped: totalSkipped,
              errors_count: totalErrors + 1,
              cursor: newestModified
                ? { last_modified_date: newestModified }
                : {},
              error_text: `Token refresh failed: ${refreshErr?.message}`,
            };
          }
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return {
            records_pulled: totalPulled,
            records_upserted: totalUpserted,
            records_skipped: totalSkipped,
            errors_count: totalErrors + 1,
            cursor: newestModified
              ? { last_modified_date: newestModified }
              : {},
            error_text: `Salesforce query failed (HTTP ${res.status}): ${errText}`,
          };
        }

        const data: SfQueryResult = await res.json();
        totalPulled += data.records.length;

        // Upsert each contact into Drift.
        for (const sfContact of data.records) {
          const firstName = sfContact.FirstName ?? "";
          const lastName = sfContact.LastName ?? "";
          const name = [firstName, lastName].filter(Boolean).join(" ") || null;
          const email = sfContact.Email?.trim().toLowerCase() || null;
          const phone = sfContact.Phone?.trim() || null;
          const company = sfContact.Account?.Name ?? null;

          // Skip contacts with no identifying information.
          if (!name && !email && !phone) {
            totalSkipped++;
            continue;
          }

          // Upsert strategy: match on email within the workspace.
          // If no email, match on name + phone as fallback.
          try {
            if (email) {
              const { data: existing } = await supabaseAdmin
                .from("contacts")
                .select("id")
                .eq("workspace_id", connection.workspace_id)
                .ilike("email", email)
                .is("deleted_at", null)
                .limit(1)
                .maybeSingle();

              if (existing) {
                await supabaseAdmin
                  .from("contacts")
                  .update({
                    name: name ?? undefined,
                    phone: phone ?? undefined,
                    company: company ?? undefined,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existing.id);
              } else {
                await supabaseAdmin.from("contacts").insert({
                  workspace_id: connection.workspace_id,
                  name,
                  email,
                  phone,
                  company,
                });
              }
              totalUpserted++;
            } else {
              // No email — try name + phone dedup.
              let existingId: string | null = null;
              if (phone) {
                const { data: byPhone } = await supabaseAdmin
                  .from("contacts")
                  .select("id")
                  .eq("workspace_id", connection.workspace_id)
                  .ilike("phone", `%${phone}%`)
                  .is("deleted_at", null)
                  .limit(1)
                  .maybeSingle();
                existingId = byPhone?.id ?? null;
              }

              if (existingId) {
                await supabaseAdmin
                  .from("contacts")
                  .update({
                    name: name ?? undefined,
                    company: company ?? undefined,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existingId);
              } else {
                await supabaseAdmin.from("contacts").insert({
                  workspace_id: connection.workspace_id,
                  name,
                  email,
                  phone,
                  company,
                });
              }
              totalUpserted++;
            }
          } catch (upsertErr: any) {
            console.error(
              `[salesforce-sync] upsert error for SF Contact ${sfContact.Id}:`,
              upsertErr?.message,
            );
            totalErrors++;
          }

          // Track the newest LastModifiedDate for cursor.
          if (
            sfContact.LastModifiedDate &&
            (!newestModified || sfContact.LastModifiedDate > newestModified)
          ) {
            newestModified = sfContact.LastModifiedDate;
          }
        }

        // Continue pagination or stop.
        if (data.done || !data.nextRecordsUrl) {
          nextUrl = null;
        } else {
          nextUrl = data.nextRecordsUrl;
          // Small delay to respect Salesforce rate limits.
          await sleep(RATE_LIMIT_DELAY_MS);
        }
      }

      return {
        records_pulled: totalPulled,
        records_upserted: totalUpserted,
        records_skipped: totalSkipped,
        errors_count: totalErrors,
        cursor: newestModified
          ? { last_modified_date: newestModified }
          : {},
      };
    },

    // ------------------------------------------------------------------
    // REFRESH — get a new access_token using the stored refresh_token
    // ------------------------------------------------------------------
    async refresh(connection: ConnectionRow): Promise<Record<string, any>> {
      const creds = connection.credentials;
      const refreshToken = creds.refresh_token as string | null;
      if (!refreshToken) {
        throw new Error("No refresh_token stored -- user must re-authorize.");
      }

      const refreshed = await refreshAccessToken(refreshToken);

      const updatedCreds = {
        ...creds,
        access_token: refreshed.access_token,
        issued_at: refreshed.issued_at,
      };

      await supabaseAdmin
        .from("integration_connections")
        .update({
          credentials: updatedCreds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      return updatedCreds;
    },
  };
}

export { makeSalesforceAdapter, sfFetch };
