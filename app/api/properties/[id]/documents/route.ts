// app/api/properties/[id]/documents/route.ts
//
// Documents attached to a property. Workspace isolation comes from
// RLS on property_documents (workspace_id pattern); we still scope
// the queries here so an authed user from another workspace gets
// nothing instead of a 403 surface.
//
// Powers two things:
//   - The "Documents" section on the property detail page.
//   - The renewal-reminder cron at /api/reminders/cron/tick — when a
//     row has expires_at within the configured horizon, the cron
//     drops a draft reminder for the linked clients.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const VALID_KINDS = [
  "lease",
  "inspection",
  "disclosure",
  "comp",
  "photo",
  "deed",
  "hoa",
  "insurance",
  "other",
];

async function loadAuth() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) return null;
  return { supabase, user, workspaceId: profile.workspace_id as string };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data, error } = await ctx.supabase
    .from("property_documents")
    .select(
      "id, title, doc_kind, file_path, external_url, expires_at, notes, created_at, updated_at",
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("property_id", id)
    .order("expires_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("property_documents GET:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Confirm the property is in this workspace before we attach
  // anything to it. RLS would also block this, but we want a clean
  // 404 instead of an opaque insert failure.
  const { data: prop } = await ctx.supabase
    .from("properties")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!prop) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const title = (body.title || "").toString().trim();
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  const doc_kind = VALID_KINDS.includes(body.doc_kind) ? body.doc_kind : "other";

  const insert: Record<string, unknown> = {
    workspace_id: ctx.workspaceId,
    property_id: id,
    created_by: ctx.user.id,
    title: title.slice(0, 200),
    doc_kind,
    file_path:
      typeof body.file_path === "string" && body.file_path
        ? body.file_path.slice(0, 500)
        : null,
    external_url:
      typeof body.external_url === "string" && body.external_url
        ? body.external_url.slice(0, 1000)
        : null,
    expires_at:
      typeof body.expires_at === "string" && body.expires_at
        ? body.expires_at
        : null,
    notes:
      typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null,
  };

  const { data, error } = await ctx.supabase
    .from("property_documents")
    .insert(insert)
    .select()
    .single();

  if (error) {
    console.error("property_documents POST:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
