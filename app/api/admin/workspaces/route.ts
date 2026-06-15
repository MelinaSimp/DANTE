import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { ALL_FEATURE_IDS, type FeatureId } from "@/lib/features";

export const dynamic = "force-dynamic";

async function verifySuperadmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) return null;
  return user;
}

export async function GET() {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: workspaces, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, created_at, owner_id, enabled_features, plan_status, billing_amount, billing_cycle, invite_code, industry")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, workspace_id, full_name, role, sms_verified_at");

  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const emailMap = new Map<string, string>();
  authUsers?.users.forEach((u) => {
    if (u.email) emailMap.set(u.id, u.email);
  });

  const enriched = (workspaces || []).map((ws) => {
    const owner = profiles?.find((p) => p.id === ws.owner_id);
    const ownerEmail = owner ? emailMap.get(owner.id) : null;
    const wsMembers = (profiles || []).filter((p) => p.workspace_id === ws.id);
    return {
      ...ws,
      owner_name: owner?.full_name || null,
      owner_email: ownerEmail || null,
      user_count: wsMembers.length,
      members: wsMembers.map((m) => ({
        id: m.id,
        name: (m as { full_name?: string | null }).full_name || null,
        email: emailMap.get(m.id) || null,
        role: (m as { role?: string | null }).role || "member",
        phone_verified: !!(m as { sms_verified_at?: string | null }).sms_verified_at,
      })),
    };
  });

  return NextResponse.json(enriched);
}

export async function PUT(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const invite_code = "DRIFT-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .insert({ name: name.trim(), plan_status: "active", invite_code })
    .select("id, name, created_at, owner_id, enabled_features, plan_status, invite_code")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("id");
  if (!workspaceId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // ── Cascade-delete all workspace-scoped data ──────────────────
  //
  // The workspace row has 109 FK children (most CASCADE). Two
  // problems prevent a simple `DELETE FROM workspaces`:
  //
  //   1. audit_logs has an append-only trigger that blocks
  //      UPDATE cascades from other FKs (e.g. profiles → audit).
  //   2. vault_item_chunks / watched_folder_files can be 100K+
  //      rows, exceeding PostgREST's statement_timeout.
  //   3. automation_events uses NO ACTION — explicit delete.
  //
  // Strategy: pre-delete the known-large and problematic tables
  // explicitly, then let CASCADE handle the ~100 smaller ones.

  const del = async (table: string) => {
    const { error: e } = await supabaseAdmin
      .from(table)
      .delete()
      .eq("workspace_id", workspaceId);
    if (e) console.error(`Workspace cascade: ${table}:`, e.message);
  };

  // Vault chain (leaf → parent). watched_folder_files FK to
  // vault_items uses SET NULL without an index — pre-null it.
  const { data: vaultIds } = await supabaseAdmin
    .from("vault_items")
    .select("id")
    .eq("workspace_id", workspaceId);
  if (vaultIds && vaultIds.length > 0) {
    const ids = vaultIds.map((v: { id: string }) => v.id);
    // Batch in chunks of 500 to avoid URI-length limits.
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500);
      await supabaseAdmin
        .from("watched_folder_files")
        .update({ vault_item_id: null })
        .in("vault_item_id", batch);
      await supabaseAdmin
        .from("watched_file_index")
        .update({ vault_item_id: null })
        .in("vault_item_id", batch);
      await supabaseAdmin
        .from("lease_abstracts")
        .update({ vault_item_id: null })
        .in("vault_item_id", batch);
    }
  }
  await del("vault_item_chunks");
  await del("vault_ingest_queue");
  await del("vault_items");
  await del("vault_projects");

  // Property join tables (no workspace_id column).
  const { data: wsProps } = await supabaseAdmin
    .from("properties")
    .select("id")
    .eq("workspace_id", workspaceId);
  if (wsProps && wsProps.length > 0) {
    const propIds = wsProps.map((p: { id: string }) => p.id);
    await supabaseAdmin
      .from("property_clients")
      .delete()
      .in("property_id", propIds);
  }

  // ── Clean up n8n workflows before DB deletion ─────────────────
  // Each Drift workflow may have a corresponding n8n workflow on
  // Railway. Delete them so we don't leave orphan workflows
  // consuming resources on the n8n instance.
  try {
    const { data: wfRows } = await supabaseAdmin
      .from("dante_workflows")
      .select("n8n_workflow_id")
      .eq("workspace_id", workspaceId)
      .not("n8n_workflow_id", "is", null);
    if (wfRows && wfRows.length > 0) {
      const n8nBridge = await import("@/lib/dante/n8n-bridge");
      await Promise.allSettled(
        wfRows.map((r) =>
          n8nBridge.deleteWorkflow(r.n8n_workflow_id as string)
        )
      );
    }
  } catch (err) {
    console.error("Workspace cascade: n8n cleanup failed:", err instanceof Error ? err.message : err);
  }

  // Explicit pre-deletes: append-only trigger tables, NO ACTION
  // FKs, and high-volume tables that can exceed statement_timeout.
  const predelete = [
    "audit_logs",
    "automation_events",
    "watched_folder_files",
    "watched_folders",
    "watched_file_index",
    "dante_memory",
    "dante_chats",
    "dante_usage_ledger",
    "dante_workflow_runs",
    "dante_workflows",
    "usage_events",
    "error_logs",
    "sms_messages",
    "compliance_flags",
    "reminders",
    "sales_records",
    "integration_connections",
    "conversations",
    "documents",
    "workspace_settings",
    "properties",
    "contacts",
    "workflows",
    "agents",
  ];

  for (const table of predelete) {
    await del(table);
  }

  // Unlink profiles (don't delete — they're auth-linked).
  await supabaseAdmin
    .from("profiles")
    .update({ workspace_id: null })
    .eq("workspace_id", workspaceId);

  // Finally remove the workspace row
  const { error } = await supabaseAdmin
    .from("workspaces")
    .delete()
    .eq("id", workspaceId);

  if (error) {
    console.error("Workspace delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { workspace_id, user_email } = await req.json();
  if (!workspace_id || !user_email) {
    return NextResponse.json({ error: "workspace_id and user_email required" }, { status: 400 });
  }

  // Find user by email
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const target = authUsers?.users.find(u => u.email === user_email);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Update their profile to this workspace
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ workspace_id })
    .eq("id", target.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, user_id: target.id });
}

export async function PATCH(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { workspace_id, enabled_features, plan_status, billing_amount, billing_cycle } = body;

  if (!workspace_id) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (enabled_features !== undefined) {
    if (enabled_features === null) {
      updates.enabled_features = null;
    } else if (Array.isArray(enabled_features)) {
      const valid = enabled_features.filter((f: string) =>
        ALL_FEATURE_IDS.includes(f as FeatureId)
      );
      updates.enabled_features = valid;
    }
  }

  if (plan_status !== undefined) updates.plan_status = plan_status;
  if (billing_amount !== undefined && typeof billing_amount === "number" && billing_amount >= 0) {
    updates.billing_amount = Math.round(billing_amount);
  }
  if (billing_cycle !== undefined && (billing_cycle === "monthly" || billing_cycle === "yearly")) {
    updates.billing_cycle = billing_cycle;
  }


  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .update(updates)
    .eq("id", workspace_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
