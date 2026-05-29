// app/api/public/v1/export/route.ts
//
// Phase 7 — public API: full workspace data export.
//
//   GET /api/public/v1/export
//   Authorization: Bearer drift_pat_<...>
//   Required scope: read:export
//
// Returns all contacts, conversations, and document metadata for the
// workspace as a single JSON payload. Intended for backup/migration
// integrations. Large workspaces may produce sizable responses; a
// streaming or paginated variant can be added later.
//
// Response shape:
//   { contacts: [...], conversations: [...], documents: [...], exported_at: string }

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireApiToken } from "@/lib/auth/api-token";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiToken(req, "read:export");
  if (!auth.ok) return auth.response;

  const workspaceId = auth.workspaceId;

  // Run all three queries in parallel for speed.
  const [contactsRes, conversationsRes, documentsRes] = await Promise.all([
    supabaseAdmin
      .from("contacts")
      .select("id, name, email, phone, company, title, tags, notes, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10000),

    supabaseAdmin
      .from("dante_chats")
      .select("id, title, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(10000),

    supabaseAdmin
      .from("vault_items")
      .select("id, title, kind, file_type, file_size, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10000),
  ]);

  // Surface the first error encountered rather than returning partial data.
  const firstError =
    contactsRes.error?.message ??
    conversationsRes.error?.message ??
    documentsRes.error?.message;
  if (firstError) {
    return NextResponse.json({ error: firstError }, { status: 500 });
  }

  return NextResponse.json({
    contacts: contactsRes.data ?? [],
    conversations: conversationsRes.data ?? [],
    documents: documentsRes.data ?? [],
    exported_at: new Date().toISOString(),
  });
}
