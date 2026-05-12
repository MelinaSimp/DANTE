// app/api/lease-abstractor/route.ts
//
// POST — trigger a lease abstraction on a vault_item_id.
// GET  — list abstracts for the workspace, optionally filtered by vault_item_id.

import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { abstractLease, type LeaseAbstract } from "@/lib/dante/lease-abstractor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json([]);

  const { searchParams } = new URL(request.url);
  const vaultItemId = searchParams.get("vault_item_id");
  const abstractId = searchParams.get("id");

  if (abstractId) {
    const { data, error } = await supabaseAdmin
      .from("lease_abstracts")
      .select("*")
      .eq("id", abstractId)
      .eq("workspace_id", profile.workspace_id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  }

  let query = supabaseAdmin
    .from("lease_abstracts")
    .select("id, vault_item_id, status, model, input_tokens, output_tokens, extraction_seconds, created_by, created_at, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (vaultItemId) query = query.eq("vault_item_id", vaultItemId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  let body: { vault_item_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const vaultItemId = body.vault_item_id;
  if (!vaultItemId) {
    return NextResponse.json({ error: "vault_item_id required" }, { status: 400 });
  }

  const { data: item } = await supabaseAdmin
    .from("vault_items")
    .select("id, workspace_id")
    .eq("id", vaultItemId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: "Vault item not found" }, { status: 404 });
  }

  const { data: chunks } = await supabaseAdmin
    .from("vault_item_chunks")
    .select("chunk_index")
    .eq("item_id", vaultItemId)
    .limit(1);
  if (!chunks || chunks.length === 0) {
    return NextResponse.json(
      { error: "Document has no indexed content. Ensure the file has been ingested first." },
      { status: 400 },
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
  }

  const result: LeaseAbstract = await abstractLease({
    workspaceId: profile.workspace_id,
    vaultItemId,
    userId: user.id,
    anthropicKey,
  });

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: profile.workspace_id,
    user_id: user.id,
    action: "lease_abstract.created",
    resource_type: "lease_abstract",
    resource_id: result.id,
    metadata: {
      vault_item_id: vaultItemId,
      status: result.status,
      field_count: result.fields.length,
      extraction_seconds: result.extraction_seconds,
    },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}
