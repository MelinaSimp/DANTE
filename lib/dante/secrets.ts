// lib/dante/secrets.ts
//
// Workspace secret loader for the workflow runner.
//
// Called once at the start of each run to populate `ctx.secrets`.
// Templates like `{{secrets.stripe_api_key}}` resolve against this
// map. After a step's config is resolved we also run a redaction
// pass over the log entry to replace any raw secret value with
// `[REDACTED:<key>]`, so secrets never leak into the run log.
//
// Cache nothing in-process — secrets can be rotated at any time and
// the performance hit is one SELECT per run.

import { supabaseAdmin } from "@/lib/supabase/admin";

export type SecretMap = Record<string, string>;

export async function loadWorkspaceSecrets(workspaceId: string): Promise<SecretMap> {
  try {
    const { data, error } = await supabaseAdmin
      .from("dante_secrets")
      .select("key, value")
      .eq("workspace_id", workspaceId);
    if (error) {
      // Missing table (migration not yet run) → empty map, runner carries on.
      if (error.code === "42P01") return {};
      console.warn("[dante] loadWorkspaceSecrets:", error.message);
      return {};
    }
    const out: SecretMap = {};
    for (const row of data || []) {
      if (row.key && typeof row.value === "string") out[row.key] = row.value;
    }
    return out;
  } catch (err) {
    console.warn("[dante] loadWorkspaceSecrets threw:", err instanceof Error ? err.message : err);
    return {};
  }
}

/**
 * Walk any JSON-ish value and replace every occurrence of each secret
 * value with `[REDACTED:<key>]`. Used to scrub log entries before they
 * hit the DB. Not perfect — a workflow that Base64-encodes a secret
 * before sending will still leak — but it catches the 90% case of
 * "someone printed the rendered URL / body into the log".
 */
export function redactSecrets<T>(value: T, secrets: SecretMap): T {
  // Build a descending-length list so we replace longer secrets first
  // (prevents a prefix of secret B swallowing a match of secret A).
  const pairs = Object.entries(secrets)
    .filter(([, v]) => v && v.length >= 4)
    .sort((a, b) => b[1].length - a[1].length);
  if (pairs.length === 0) return value;

  function walk(v: unknown): unknown {
    if (typeof v === "string") {
      let out = v;
      for (const [key, secret] of pairs) {
        if (out.includes(secret)) {
          // Replace all occurrences without engaging regex specials.
          out = out.split(secret).join(`[REDACTED:${key}]`);
        }
      }
      return out;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, inner] of Object.entries(v as Record<string, unknown>)) {
        out[k] = walk(inner);
      }
      return out;
    }
    return v;
  }

  return walk(value) as T;
}
