// lib/supabase/admin.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

/**
 * Singleton admin client – OK to reuse in server code.
 * (Service role bypasses RLS. Only use in trusted server routes/actions.)
 */
export const supabaseAdmin: SupabaseClient = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { 
    headers: { "X-Client-Info": "drift-crm-server" },
    fetch: (url, options = {}) => {
      return fetch(url, {
        ...options,
        // Add timeout to prevent hanging connections
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });
    },
  },
});

/**
 * Factory -- use inside server actions / route handlers if you prefer fresh clients.
 * Pass timeoutMs for long-running operations (vector inserts, large queries).
 */
export function adminClient(timeoutMs = 30_000): SupabaseClient {
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { "X-Client-Info": "drift-crm-server" },
      fetch: (url, options = {}) => {
        return fetch(url, {
          ...options,
          signal: AbortSignal.timeout(timeoutMs),
        });
      },
    },
  });
}
