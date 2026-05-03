// lib/auth/api-token.ts
//
// Phase 7 W7.1 — public API token auth.
//
// Tokens are bearer credentials in the Authorization header:
//   Authorization: Bearer drift_pat_<32 hex chars>
//
// Storage: only the sha256 hash + first-8-char prefix. Plaintext
// is shown to the user once at creation and never retrievable.
//
// requireApiToken() validates the bearer header against api_tokens,
// confirms not revoked, optionally enforces a scope, returns
// workspace context the route uses.
//
// All public-API routes call this instead of the user-cookie-based
// auth helpers — different identity model, different rate limits.

import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_PREFIX = "drift_pat_";

export interface ApiTokenContext {
  ok: true;
  tokenId: string;
  workspaceId: string;
  scopes: string[];
}

export interface ApiTokenFailure {
  ok: false;
  status: number;
  response: Response;
}

/**
 * Validate the bearer token in the request. Returns workspace
 * context on success or a 401/403 Response on failure.
 */
export async function requireApiToken(
  req: NextRequest,
  requiredScope?: string,
): Promise<ApiTokenContext | ApiTokenFailure> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return failure(401, "missing_bearer_token");
  }
  const plaintext = auth.slice(7).trim();
  if (!plaintext.startsWith(TOKEN_PREFIX)) {
    return failure(401, "invalid_token_format");
  }
  const hash = createHash("sha256").update(plaintext).digest("hex");

  const { data: row } = await supabaseAdmin
    .from("api_tokens")
    .select("id, workspace_id, scopes, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!row) return failure(401, "token_not_found");
  if ((row as { revoked_at?: string | null }).revoked_at) {
    return failure(401, "token_revoked");
  }

  const scopes = ((row as { scopes?: string[] }).scopes || []) as string[];
  if (requiredScope && !scopes.includes(requiredScope)) {
    return failure(403, `scope_required:${requiredScope}`);
  }

  // Update last_used_at — fire-and-forget so the route stays fast.
  void supabaseAdmin
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", (row as { id: string }).id);

  return {
    ok: true,
    tokenId: (row as { id: string }).id,
    workspaceId: (row as { workspace_id: string }).workspace_id,
    scopes,
  };
}

/**
 * Generate a fresh plaintext token. Returns both the plaintext
 * (shown to the user once) and the hash + prefix that get stored.
 */
export function generateToken(): { plaintext: string; hash: string; prefix: string } {
  const random = randomBytes(24).toString("hex"); // 48 hex chars
  const plaintext = `${TOKEN_PREFIX}${random}`;
  const hash = createHash("sha256").update(plaintext).digest("hex");
  const prefix = plaintext.slice(0, TOKEN_PREFIX.length + 8);
  return { plaintext, hash, prefix };
}

function failure(status: number, error: string): ApiTokenFailure {
  return {
    ok: false,
    status,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  };
}
