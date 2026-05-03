// app/api/public/v1/contacts/route.ts
//
// Phase 7 W7.1 — first public API endpoint.
//
//   GET /api/public/v1/contacts?limit=50&q=foo
//   Authorization: Bearer drift_pat_<...>
//   Required scope: read:contacts
//
// Token-based auth. Workspace scoped via the token's
// workspace_id. Standard pagination via `limit` (max 200).
// Search via `q` matches name/email substring.
//
// Response shape:
//   { items: [{ id, name, email, phone, created_at }], next: null }

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireApiToken } from "@/lib/auth/api-token";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiToken(req, "read:contacts");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);
  const q = url.searchParams.get("q")?.trim() ?? "";

  let query = supabaseAdmin
    .from("contacts")
    .select("id, name, email, phone, created_at")
    .eq("workspace_id", auth.workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (q) {
    // Conservative: name/email substring. ts-search would be better
    // for free-form queries but this is the v1 — predictable shape
    // beats clever ranking for an external integrator.
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [], next: null });
}
