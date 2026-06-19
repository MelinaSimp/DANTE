// app/api/lease-abstractor/route.ts
//
// POST — trigger a lease abstraction on a vault_item_id.
// GET  — list abstracts for the workspace, optionally filtered by vault_item_id.

import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { abstractLease, type LeaseAbstract } from "@/lib/dante/lease-abstractor";
import { resolveServiceWorkspace } from "@/lib/api/service-auth";

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
    .select("id, vault_item_id, status, tenant_name, expiration_date, property_id, model, input_tokens, output_tokens, extraction_seconds, created_by, created_at, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (vaultItemId) query = query.eq("vault_item_id", vaultItemId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  // Service callers (n8n workflow nodes) present the service-role key +
  // workspace header and act as the workspace owner. Otherwise fall back
  // to the browser session.
  let workspaceId: string;
  let userId: string;
  const serviceWorkspace = resolveServiceWorkspace(request);
  if (serviceWorkspace) {
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("owner_id")
      .eq("id", serviceWorkspace)
      .maybeSingle();
    if (!ws?.owner_id) {
      return NextResponse.json({ error: "Workspace has no owner for service call" }, { status: 400 });
    }
    workspaceId = serviceWorkspace;
    userId = ws.owner_id as string;
  } else {
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
    workspaceId = profile.workspace_id;
    userId = user.id;
  }

  let body: {
    vault_item_id?: string;
    options?: {
      refinePrompt?: boolean;
      webSearch?: boolean;
      templateFields?: Array<{ name: string; category: string; description: string }>;
    };
  };
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
    .eq("workspace_id", workspaceId)
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

  const templateFields = body.options?.templateFields;
  const result: LeaseAbstract = await abstractLease({
    workspaceId,
    vaultItemId,
    userId,
    anthropicKey,
    fields: templateFields?.length ? templateFields.map((f) => ({
      name: f.name,
      category: f.category as "deal_terms" | "financial_terms" | "key_clauses",
      description: f.description,
    })) : undefined,
    options: body.options,
  });

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: workspaceId,
    user_id: userId,
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

// ── PATCH — update abstract fields, property link, or denormalized columns ──

interface PatchBody {
  id: string;
  /** Updated fields array (full replacement). */
  fields?: Array<{
    name: string;
    category: string;
    value: string | null;
    citation?: string;
    page?: number | null;
    confidence: string;
  }>;
  /** Link to a CRM property. */
  property_id?: string | null;
}

export async function PATCH(request: NextRequest) {
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

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from("lease_abstracts")
    .select("id, workspace_id, status")
    .eq("id", body.id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  // Update fields and re-denormalize tenant_name / expiration_date
  if (body.fields) {
    updates.fields = body.fields;

    // Re-extract denormalized columns from updated fields
    const tenantField = body.fields.find(
      (f) => f.name === "Tenant Name" && f.value,
    );
    const expirationField = body.fields.find(
      (f) => f.name === "Expiration Date" && f.value,
    );
    updates.tenant_name = tenantField?.value?.slice(0, 500) ?? null;

    // Parse expiration date
    const expVal = expirationField?.value ?? null;
    if (expVal) {
      const isoMatch = expVal.match(/(\d{4}-\d{2}-\d{2})/);
      if (isoMatch) {
        updates.expiration_date = isoMatch[1];
      } else {
        const d = new Date(expVal);
        if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
          updates.expiration_date = d.toISOString().slice(0, 10);
        }
      }
    }
  }

  // Update property link
  if (body.property_id !== undefined) {
    if (body.property_id) {
      // Verify the property belongs to the workspace
      const { data: prop } = await supabaseAdmin
        .from("properties")
        .select("id")
        .eq("id", body.property_id)
        .eq("workspace_id", profile.workspace_id)
        .maybeSingle();
      if (!prop) {
        return NextResponse.json(
          { error: "Property not found in workspace" },
          { status: 404 },
        );
      }
    }
    updates.property_id = body.property_id;
  }

  const { error: updateErr } = await supabaseAdmin
    .from("lease_abstracts")
    .update(updates)
    .eq("id", body.id);

  if (updateErr) {
    return NextResponse.json(
      { error: `Update failed: ${updateErr.message}` },
      { status: 500 },
    );
  }

  // Audit the edit
  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: profile.workspace_id,
    user_id: user.id,
    action: "lease_abstract.updated",
    resource_type: "lease_abstract",
    resource_id: body.id,
    metadata: {
      fields_updated: !!body.fields,
      property_linked: body.property_id !== undefined,
    },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, id: body.id });
}
