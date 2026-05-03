// app/api/dante/since-last-login/route.ts
//
// "Since you were last here" digest powering the WhatChanged panel
// on the dashboard. The killer feature for the older RIA buyer:
// they open the app at 7am and see exactly what's changed in their
// book overnight, grouped by work-unit, no scrolling required.
//
// Two classes of signal:
//
//   • Time-scoped (only count items created/changed since last_seen_at):
//       - workflow runs that fired
//       - compliance flags raised
//       - AI memories pending supervisor approval
//
//   • Always-on (deadlines and stuck queues — show even on first
//     visit, since the question is "what needs me" not "what
//     changed"):
//       - drafts pending advisor review (outbound_review_queue)
//       - households due for review in next 7 days
//       - OBA attestations due in next 30 days
//
// After the response is returned, last_seen_at is bumped to now()
// so the next visit only shows newer items in the time-scoped
// groups. The always-on groups don't depend on that timestamp.
//
// Vertical-aware: realtor-side surfaces (listing DOM, escrow timers)
// would slot in as additional groups once the underlying data
// exists. For wealth-only workspaces those groups stay empty and
// auto-hide.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Group = {
  kind:
    | "pending_drafts"
    | "reviews_due"
    | "workflow_runs"
    | "oba_due"
    | "compliance_flags"
    | "memories_pending";
  title: string;
  count: number;
  href?: string;
  items: Array<{
    id: string;
    label: string;
    sublabel?: string | null;
    when?: string | null; // ISO
    href?: string;
  }>;
};

const ITEMS_PER_GROUP = 5;

export async function GET() {
  const sb = await createServerSupabase();
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("workspace_id, last_seen_at")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = (profile as { workspace_id?: string | null } | null)?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json(
      { since: null, is_first_visit: true, groups: [] },
      { status: 200 },
    );
  }

  const lastSeenAt = (profile as { last_seen_at?: string | null }).last_seen_at;
  const since = lastSeenAt ?? null;
  const isFirstVisit = !since;
  const sinceClause = since ?? new Date(0).toISOString();

  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 86400_000).toISOString().slice(0, 10);
  const in30d = new Date(now.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
  const todayDate = now.toISOString().slice(0, 10);

  // Fan out the queries in parallel. Each one is workspace-scoped
  // and uses an existing index. None of these is heavy (LIMIT 5
  // each); the round-trip is cheap.
  const [
    pendingDrafts,
    reviewsDue,
    workflowRuns,
    obaDue,
    complianceFlags,
    memoriesPending,
  ] = await Promise.all([
    // Drafts the advisor needs to clear. Always-on (a 3-week-old
    // draft still demands attention).
    supabaseAdmin
      .from("outbound_review_queue")
      .select("id, kind, payload, contact_id, created_at", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .eq("review_status", "pending")
      .order("created_at", { ascending: true })
      .limit(ITEMS_PER_GROUP),

    // Households whose review_date is on or before 7 days from now
    // and not yet completed. Always-on.
    supabaseAdmin
      .from("contacts")
      .select("id, name, full_name, next_review_date, review_stage", {
        count: "exact",
      })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .not("next_review_date", "is", null)
      .lte("next_review_date", in7d)
      .neq("review_stage", "done")
      .order("next_review_date", { ascending: true })
      .limit(ITEMS_PER_GROUP),

    // Workflow runs that fired since last visit. Time-scoped.
    supabaseAdmin
      .from("dante_workflow_runs")
      .select("id, workflow_id, status, started_at, error", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .gt("started_at", sinceClause)
      .in("status", ["success", "error"])
      .order("started_at", { ascending: false })
      .limit(ITEMS_PER_GROUP),

    // OBA attestations due in next 30 days. Always-on.
    supabaseAdmin
      .from("compliance_oba_records")
      .select("id, advisor_name, activity_name, next_attestation_due", {
        count: "exact",
      })
      .eq("workspace_id", workspaceId)
      .not("next_attestation_due", "is", null)
      .lte("next_attestation_due", in30d)
      .gte("next_attestation_due", todayDate)
      .order("next_attestation_due", { ascending: true })
      .limit(ITEMS_PER_GROUP),

    // Compliance flags raised since last visit, still pending.
    // Time-scoped (older pending flags belong on the compliance
    // queue page, not here).
    supabaseAdmin
      .from("compliance_flags")
      .select("id, severity, message, source_type, created_at", {
        count: "exact",
      })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .gt("created_at", sinceClause)
      .order("created_at", { ascending: false })
      .limit(ITEMS_PER_GROUP),

    // AI-written memories awaiting supervisor approval. Time-scoped
    // — older pending memories live on the memory review page.
    supabaseAdmin
      .from("dante_memory")
      .select("id, kind, content, subject_contact_id, created_at", {
        count: "exact",
      })
      .eq("workspace_id", workspaceId)
      .eq("review_status", "pending")
      .is("deleted_at", null)
      .gt("created_at", sinceClause)
      .order("created_at", { ascending: false })
      .limit(ITEMS_PER_GROUP),
  ]);

  const groups: Group[] = [];

  if ((pendingDrafts.count ?? 0) > 0) {
    groups.push({
      kind: "pending_drafts",
      title: "Drafts awaiting your review",
      count: pendingDrafts.count ?? 0,
      href: "/compliance/queue",
      items: (pendingDrafts.data || []).map((r) => {
        const payload = (r as { payload?: { subject?: string; title?: string } }).payload || {};
        const label =
          payload.subject || payload.title || (r as { kind: string }).kind || "Draft";
        return {
          id: (r as { id: string }).id,
          label: String(label),
          sublabel: (r as { kind: string }).kind,
          when: (r as { created_at: string }).created_at,
          href: "/compliance/queue",
        };
      }),
    });
  }

  if ((reviewsDue.count ?? 0) > 0) {
    groups.push({
      kind: "reviews_due",
      title: "Households due for review",
      count: reviewsDue.count ?? 0,
      href: "/client-details-overview",
      items: (reviewsDue.data || []).map((r) => {
        const row = r as {
          id: string;
          name?: string;
          full_name?: string;
          next_review_date?: string;
          review_stage?: string;
        };
        return {
          id: row.id,
          label: row.name || row.full_name || "Household",
          sublabel: row.review_stage || null,
          when: row.next_review_date ? `${row.next_review_date}T00:00:00Z` : null,
          href: `/contact/${row.id}`,
        };
      }),
    });
  }

  if ((workflowRuns.count ?? 0) > 0) {
    groups.push({
      kind: "workflow_runs",
      title: "Workflows that ran since you were last here",
      count: workflowRuns.count ?? 0,
      href: "/dante/workflows",
      items: (workflowRuns.data || []).map((r) => {
        const row = r as {
          id: string;
          workflow_id: string;
          status: string;
          started_at: string;
          error?: string | null;
        };
        return {
          id: row.id,
          label:
            row.status === "error"
              ? `Workflow failed`
              : `Workflow completed`,
          sublabel: row.error ? row.error.slice(0, 80) : row.status,
          when: row.started_at,
          href: `/dante/workflows`,
        };
      }),
    });
  }

  if ((obaDue.count ?? 0) > 0) {
    groups.push({
      kind: "oba_due",
      title: "OBA attestations due",
      count: obaDue.count ?? 0,
      href: "/compliance",
      items: (obaDue.data || []).map((r) => {
        const row = r as {
          id: string;
          advisor_name: string;
          activity_name: string;
          next_attestation_due: string;
        };
        return {
          id: row.id,
          label: row.activity_name,
          sublabel: row.advisor_name,
          when: `${row.next_attestation_due}T00:00:00Z`,
          href: "/compliance",
        };
      }),
    });
  }

  if ((complianceFlags.count ?? 0) > 0) {
    groups.push({
      kind: "compliance_flags",
      title: "New compliance flags",
      count: complianceFlags.count ?? 0,
      href: "/compliance/queue",
      items: (complianceFlags.data || []).map((r) => {
        const row = r as {
          id: string;
          severity: string;
          message: string;
          source_type: string;
          created_at: string;
        };
        return {
          id: row.id,
          label: row.message,
          sublabel: `${row.severity} · ${row.source_type}`,
          when: row.created_at,
          href: "/compliance/queue",
        };
      }),
    });
  }

  if ((memoriesPending.count ?? 0) > 0) {
    groups.push({
      kind: "memories_pending",
      title: "AI-written memories awaiting your approval",
      count: memoriesPending.count ?? 0,
      href: "/dante/memory/review",
      items: (memoriesPending.data || []).map((r) => {
        const row = r as {
          id: string;
          kind: string;
          content: string;
          subject_contact_id?: string | null;
          created_at: string;
        };
        return {
          id: row.id,
          label: row.content.slice(0, 100) + (row.content.length > 100 ? "…" : ""),
          sublabel: row.kind,
          when: row.created_at,
          href: "/dante/memory/review",
        };
      }),
    });
  }

  // Bump last_seen_at AFTER the queries so the next visit shows
  // only what's new since this one. Done as a fire-and-forget
  // best-effort write; failure here doesn't break the response.
  void supabaseAdmin
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", user.id)
    .then(({ error }) => {
      if (error) console.warn("[since-last-login] last_seen_at bump failed:", error.message);
    });

  return NextResponse.json({
    since,
    is_first_visit: isFirstVisit,
    groups,
  });
}
