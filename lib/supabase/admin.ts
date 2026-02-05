// lib/supabase/admin.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { "X-Client-Info": "drift-crm-server" },
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      return fetch(input, {
        ...init,
        signal: AbortSignal.timeout(30000),
      });
    },
  },
};

let _client: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  _client = createClient(url, serviceRole, clientOptions);
  return _client;
}

/**
 * Singleton admin client – OK to reuse in server code.
 * Throws at first use if env vars are missing (allows next build to complete without them).
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getAdminClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Factory – use inside server actions / route handlers if you prefer fresh clients.
 */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRole, clientOptions);
}
