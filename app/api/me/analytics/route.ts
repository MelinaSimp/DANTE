// GET /api/me/analytics
//
// Workspace-scoped analytics for the admin dashboard. Returns
// pipeline KPIs, activity metrics, and trend data. Owner-only.
//
// Response shape:
//   contacts: { total, by_stage, new_this_month, new_last_month }
//   properties: { total, by_status, new_this_month, new_last_month }
//   workflows: { total, runs_this_month, runs_last_month, by_status }
//   conversations: { total, this_month, avg_messages_per_chat }
//   usage: { cost_cents_this_month, cost_cents_last_month }

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isOwner } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function startOfMonth(offset = 0): string {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1),
  ).toISOString();
}

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  if (!isOwner(profile.role))
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const wsId = profile.workspace_id;
  const thisMonth = startOfMonth(0);
  const lastMonth = startOfMonth(-1);

  // Run all queries in parallel for speed
  const [
    contactsTotal,
    contactsByStage,
    contactsThisMonth,
    contactsLastMonth,
    propertiesTotal,
    propertiesByStatus,
    propertiesThisMonth,
    propertiesLastMonth,
    workflowsTotal,
    workflowRunsThisMonth,
    workflowRunsLastMonth,
    chatsTotal,
    chatsThisMonth,
    usageThisMonth,
    usageLastMonth,
  ] = await Promise.all([
    // Contacts total
    supabaseAdmin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId)
      .is("deleted_at", null),

    // Contacts by stage (RPC may not exist yet -- graceful fallback)
    Promise.resolve(
      supabaseAdmin.rpc("count_contacts_by_stage", { ws_id: wsId }),
    ).then((r) => r.data).catch(() => null),

    // Contacts new this month
    supabaseAdmin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId)
      .is("deleted_at", null)
      .gte("created_at", thisMonth),

    // Contacts new last month
    supabaseAdmin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId)
      .is("deleted_at", null)
      .gte("created_at", lastMonth)
      .lt("created_at", thisMonth),

    // Properties total
    supabaseAdmin
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId),

    // Properties by status (RPC may not exist yet -- graceful fallback)
    Promise.resolve(
      supabaseAdmin.rpc("count_properties_by_status", { ws_id: wsId }),
    ).then((r) => r.data).catch(() => null),

    // Properties new this month
    supabaseAdmin
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId)
      .gte("created_at", thisMonth),

    // Properties new last month
    supabaseAdmin
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId)
      .gte("created_at", lastMonth)
      .lt("created_at", thisMonth),

    // Workflows total
    supabaseAdmin
      .from("dante_workflows")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId),

    // Workflow runs this month
    supabaseAdmin
      .from("dante_workflow_runs")
      .select("id, status", { count: "exact" })
      .eq("workspace_id", wsId)
      .gte("created_at", thisMonth),

    // Workflow runs last month
    supabaseAdmin
      .from("dante_workflow_runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId)
      .gte("created_at", lastMonth)
      .lt("created_at", thisMonth),

    // Chats total
    supabaseAdmin
      .from("dante_chats")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId),

    // Chats this month
    supabaseAdmin
      .from("dante_chats")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId)
      .gte("created_at", thisMonth),

    // Usage cost this month
    supabaseAdmin
      .from("dante_usage_ledger")
      .select("cost_cents")
      .eq("workspace_id", wsId)
      .gte("created_at", thisMonth),

    // Usage cost last month
    supabaseAdmin
      .from("dante_usage_ledger")
      .select("cost_cents")
      .eq("workspace_id", wsId)
      .gte("created_at", lastMonth)
      .lt("created_at", thisMonth),
  ]);

  // Aggregate workflow run statuses
  const runStatusCounts: Record<string, number> = {};
  if (workflowRunsThisMonth.data) {
    for (const run of workflowRunsThisMonth.data) {
      const s = (run as { status?: string }).status || "unknown";
      runStatusCounts[s] = (runStatusCounts[s] || 0) + 1;
    }
  }

  // Sum usage costs
  const sumCents = (rows: { cost_cents: number }[] | null) =>
    (rows || []).reduce((s, r) => s + (r.cost_cents || 0), 0);

  return NextResponse.json({
    contacts: {
      total: contactsTotal.count ?? 0,
      by_stage: contactsByStage ?? [],
      new_this_month: contactsThisMonth.count ?? 0,
      new_last_month: contactsLastMonth.count ?? 0,
    },
    properties: {
      total: propertiesTotal.count ?? 0,
      by_status: propertiesByStatus ?? [],
      new_this_month: propertiesThisMonth.count ?? 0,
      new_last_month: propertiesLastMonth.count ?? 0,
    },
    workflows: {
      total: workflowsTotal.count ?? 0,
      runs_this_month: workflowRunsThisMonth.count ?? 0,
      runs_last_month: workflowRunsLastMonth.count ?? 0,
      runs_by_status: runStatusCounts,
    },
    conversations: {
      total: chatsTotal.count ?? 0,
      this_month: chatsThisMonth.count ?? 0,
    },
    usage: {
      cost_cents_this_month: sumCents(usageThisMonth.data as { cost_cents: number }[] | null),
      cost_cents_last_month: sumCents(usageLastMonth.data as { cost_cents: number }[] | null),
    },
  });
}
