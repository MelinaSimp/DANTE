// app/api/vault/route.ts
//
// Workspace Vault — list + create. Templates and documents share one
// table with a `kind` column. Files arrive here already uploaded via
// /api/upload (same pipeline used for agent data sources); this route
// just stamps the metadata row + optional client tags.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getAccessibleProjectIds } from "@/lib/vault/project-access";

const VALID_KINDS = ["template", "document"];

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json([]);

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const propertyId = searchParams.get("property_id");
  const contactId = searchParams.get("contact_id");
  const search = searchParams.get("q")?.trim();

  // Contact filter: resolve to vault_item_ids first, then filter the
  // main fetch by id. Two queries, but keeps the main query simple.
  let onlyIds: string[] | null = null;
  if (contactId) {
    const { data: links } = await supabase
      .from("vault_item_clients")
      .select("vault_item_id")
      .eq("contact_id", contactId);
    onlyIds = (links || []).map((l: any) => l.vault_item_id);
    if (onlyIds.length === 0) return NextResponse.json([]);
  }

  const { isAdmin, projectIds } = await getAccessibleProjectIds(
    supabase,
    user.id,
    profile.workspace_id,
  );

  let query = supabase
    .from("vault_items")
    .select(
      "id, kind, title, description, file_url, file_size, file_type, property_id, created_at, updated_at"
    )
    .eq("workspace_id", profile.workspace_id)
    .order("updated_at", { ascending: false });

  if (!isAdmin && projectIds) {
    const allowed = projectIds.length > 0 ? projectIds : ["00000000-0000-0000-0000-000000000000"];
    query = query.or(`project_id.in.(${allowed.join(",")}),project_id.is.null`);
  }

  if (kind && VALID_KINDS.includes(kind)) query = query.eq("kind", kind);
  if (propertyId) query = query.eq("property_id", propertyId);
  if (onlyIds) query = query.in("id", onlyIds);
  if (search) {
    const sanitized = search.replace(/[%_,().*]/g, "");
    if (sanitized) {
      query = query.or(
        `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,content.ilike.%${sanitized}%`
      );
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("Vault GET:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const body = await request.json();
  const title = (body.title || "").trim();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
  const kind = VALID_KINDS.includes(body.kind) ? body.kind : "document";

  if (body.project_id) {
    const { canAccessProject } = await import("@/lib/vault/project-access");
    if (!(await canAccessProject(supabase, user.id, profile.workspace_id, body.project_id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const insert: Record<string, unknown> = {
    workspace_id: profile.workspace_id,
    uploaded_by: user.id,
    kind,
    title,
    description: body.description?.trim() || null,
    file_url: body.file_url || null,
    file_size: typeof body.file_size === "number" ? body.file_size : null,
    file_type: body.file_type || null,
    content: body.content || null,
    property_id: body.property_id || null,
    project_id: body.project_id || null,
  };

  const { data, error } = await supabase
    .from("vault_items")
    .insert(insert)
    .select()
    .single();
  if (error) {
    console.error("Vault POST:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Optional client tags from the create call.
  if (Array.isArray(body.contact_ids) && body.contact_ids.length > 0) {
    const rows = body.contact_ids.map((cid: string) => ({
      vault_item_id: data.id,
      contact_id: cid,
    }));
    await supabase.from("vault_item_clients").insert(rows);
  }

  // Fire-and-forget: chunk + embed the document so Dante can search it.
  // Failures are logged but don't fail the upload — the user-facing
  // happy path is "file is in vault", and ingestion is recoverable via
  // POST /api/vault/[id]/ingest or /api/vault/reingest.
  //
  // Triggers on EITHER inline content (e.g. a typed note) OR a file_url
  // (uploaded PDF/etc) — the ingest pipeline now downloads + extracts
  // text from file_url when content is empty.
  const hasContent =
    typeof body.content === "string" && body.content.trim().length > 0;
  const hasFile = typeof body.file_url === "string" && body.file_url.length > 0;
  if (data?.id && (hasContent || hasFile)) {
    void import("@/lib/vault/ingest")
      .then(({ ingestVaultItem }) => ingestVaultItem(data.id))
      .catch((err) =>
        console.error("[vault.create] ingest failed:", err?.message),
      );
  }

  return NextResponse.json(data);
}
