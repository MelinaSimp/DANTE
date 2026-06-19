// lib/api/service-auth.ts
//
// Service-to-service auth for workflow callers (the custom n8n nodes).
// A node presents the workspace's service-role key as a bearer token
// plus an x-drift-workspace-id header. We accept it only when the bearer
// matches this deployment's SUPABASE_SERVICE_ROLE_KEY — i.e. a caller
// that already holds full database access — so this grants no new
// capability, it just lets that caller reach app-logic endpoints
// (lease abstraction, underwriting) for a given workspace without a
// browser session. No new secret to provision: the node already has
// this key in its DriftCreApi credential.

import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Returns the workspace id for a valid service request, or null when the
 * request is not a service call (caller should fall back to session auth).
 */
export function resolveServiceWorkspace(req: Request): string | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;

  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  if (!safeEqual(m[1].trim(), serviceKey)) return null;

  const ws = req.headers.get("x-drift-workspace-id");
  return ws && ws.trim() ? ws.trim() : null;
}
