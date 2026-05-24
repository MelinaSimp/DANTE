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
// Vertical-aware: shared groups (drafts, contact reviews, workflow
// runs, compliance flags, memory queue) fan out for both verticals.
// Wealth-only group: OBA attestations (compliance_oba_records is a
// FINRA/RIA outside-business-activity surface, irrelevant for
// realtors). Realtor-only groups: properties closing soon,
// properties stuck in a transaction stage, new properties since
// last visit — all keyed off the `properties` table's
// transaction_stage / expected_close_date / stage_entered_at
// fields.

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
    | "memories_pending"
    | "closings_soon"
    | "stuck_properties"
    | "new_properties"
    | "regulatory_updates";
  title: string;
  count: number;
  href?: string;
  /** Optional secondary action surfaced in the panel header. Used by
   *  regulatory_updates to offer "Ask Dante what these mean for my
   *  book" — the panel dispatches a window event the AppTopBar
   *  listens for, opening the Ask modal pre-filled. */
  action?: {
    label: string;
    /** A natural-language prompt the panel will pre-fill into the
     *  Ask modal when the user clicks. */
    ask_prompt: string;
  };
  items: Array<{
    id: string;
    label: string;
    sublabel?: string | null;
    when?: string | null; // ISO
    href?: string;
    /** Brief-only: the agent's recommended action this week.
     *  Renders as an italic line below the row when present. */
    recommended_action?: string | null;
    /** Brief-only: list of affected clients the agent named.
     *  Renders as small chips beneath the row. contact_id is a
     *  best-effort link target — null when the agent didn't name
     *  a specific contact (generic "all clients with retirement
     *  accounts" findings). */
    affected_clients?: Array<{
      contact_id?: string | null;
      name: string;
      why: string;
    }>;
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

  const industry = "real_estate" as const;

  const lastSeenAt = (profile as { last_seen_at?: string | null }).last_seen_at;
  const since = lastSeenAt ?? null;
  const isFirstVisit = !since;
  const sinceClause = since ?? new Date(0).toISOString();

  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 86400_000).toISOString().slice(0, 10);
  const in30d = new Date(now.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
  const todayDate = now.toISOString().slice(0, 10);
  const stuckCutoff = new Date(now.getTime() - 21 * 86400_000).toISOString();

  const isRealtor = industry === "real_estate";

  // Fan out the queries in parallel. Cross-vertical groups always
  // run; OBA is wealth-only; closings/stuck/new-property are
  // realtor-only. The unused-side queries resolve to null promises
  // so the destructuring stays positional.
  const noop = Promise.resolve({ data: null, count: 0 });

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
    closingsSoon,
    stuckProperties,
    newProperties,
    regulatoryUpdates,
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

    // OBA attestations due in next 30 days. Wealth-only — outside
    // business activity tracking is FINRA/RIA. Realtors don't have
    // an analogous concept here; skip the round-trip entirely.
    isRealtor
      ? noop
      : supabaseAdmin
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

    // Realtor-only: properties whose expected close date is within
    // the next 7 days and whose stage is offer/pending. Always-on
    // — closing dates don't expire when you log out.
    isRealtor
      ? supabaseAdmin
          .from("properties")
          .select("id, address_line1, transaction_stage, expected_close_date", {
            count: "exact",
          })
          .eq("workspace_id", workspaceId)
          .in("transaction_stage", ["offer", "pending"])
          .not("expected_close_date", "is", null)
          .lte("expected_close_date", in7d)
          .gte("expected_close_date", todayDate)
          .order("expected_close_date", { ascending: true })
          .limit(ITEMS_PER_GROUP)
      : noop,

    // Realtor-only: properties stuck in a non-terminal transaction
    // stage (listed/showing/offer) for >21 days. Catches the
    // listings going quiet, the offers without a counter, the
    // showings that didn't convert. Always-on.
    isRealtor
      ? supabaseAdmin
          .from("properties")
          .select("id, address_line1, transaction_stage, stage_entered_at", {
            count: "exact",
          })
          .eq("workspace_id", workspaceId)
          .in("transaction_stage", ["listed", "showing", "offer"])
          .not("stage_entered_at", "is", null)
          .lt("stage_entered_at", stuckCutoff)
          .order("stage_entered_at", { ascending: true })
          .limit(ITEMS_PER_GROUP)
      : noop,

    // Realtor-only: new properties created since last visit. Time-
    // scoped — first-time login already shows everything elsewhere.
    isRealtor
      ? supabaseAdmin
          .from("properties")
          .select("id, address_line1, transaction_stage, created_at, status", {
            count: "exact",
          })
          .eq("workspace_id", workspaceId)
          .gt("created_at", sinceClause)
          .order("created_at", { ascending: false })
          .limit(ITEMS_PER_GROUP)
      : noop,

    // Regulatory updates published since last visit. Workspace-
    // shared corpus (no workspace_id filter) but scoped by
    // industry_scope so a realtor doesn't see FINRA OBA news and
    // an advisor doesn't see HUD enforcement. Time-scoped: this
    // is the "what's new at the regulators since I logged in"
    // surface — the killer-feature ask Luca flagged.
    supabaseAdmin
      .from("regulatory_corpus_items")
      .select("id, authority, source_kind, source_url, title, published_at", {
        count: "exact",
      })
      .contains("industry_scope", [industry])
      .gt("published_at", sinceClause)
      .order("published_at", { ascending: false })
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

  if ((closingsSoon.count ?? 0) > 0) {
    groups.push({
      kind: "closings_soon",
      title: "Closings in the next 7 days",
      count: closingsSoon.count ?? 0,
      href: "/properties",
      items: ((closingsSoon.data || []) as Array<{
        id: string;
        address_line1: string;
        transaction_stage: string;
        expected_close_date: string;
      }>).map((row) => ({
        id: row.id,
        label: row.address_line1,
        sublabel: row.transaction_stage,
        when: `${row.expected_close_date}T00:00:00Z`,
        href: `/properties/${row.id}`,
      })),
    });
  }

  if ((stuckProperties.count ?? 0) > 0) {
    groups.push({
      kind: "stuck_properties",
      title: "Properties stuck in stage > 3 weeks",
      count: stuckProperties.count ?? 0,
      href: "/properties",
      items: ((stuckProperties.data || []) as Array<{
        id: string;
        address_line1: string;
        transaction_stage: string;
        stage_entered_at: string;
      }>).map((row) => ({
        id: row.id,
        label: row.address_line1,
        sublabel: `in ${row.transaction_stage}`,
        when: row.stage_entered_at,
        href: `/properties/${row.id}`,
      })),
    });
  }

  if ((newProperties.count ?? 0) > 0) {
    groups.push({
      kind: "new_properties",
      title: "Properties added since you were last here",
      count: newProperties.count ?? 0,
      href: "/properties",
      items: ((newProperties.data || []) as Array<{
        id: string;
        address_line1: string;
        transaction_stage?: string | null;
        status?: string | null;
        created_at: string;
      }>).map((row) => ({
        id: row.id,
        label: row.address_line1,
        sublabel: row.transaction_stage || row.status || null,
        when: row.created_at,
        href: `/properties/${row.id}`,
      })),
    });
  }

  // Latest auto-generated regulatory brief — when one exists, the
  // dashboard shows the agent's already-completed analysis instead
  // of a raw list of items. The "find raw items + click to analyze"
  // path remains as a fallback for workspaces where the brief cron
  // hasn't run yet.
  const { data: latestBrief } = await supabaseAdmin
    .from("regulatory_briefs")
    .select(
      "id, generated_at, items_considered, items_relevant, findings, read_at",
    )
    .eq("workspace_id", workspaceId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const briefData = latestBrief as
    | {
        id: string;
        generated_at: string;
        items_considered: number;
        items_relevant: number;
        findings: unknown;
        read_at: string | null;
      }
    | null;

  if (briefData && Array.isArray(briefData.findings) && briefData.findings.length > 0) {
    const findings = briefData.findings as Array<{
      item_id: string;
      authority: string;
      title: string;
      source_url: string;
      relevance: "high" | "medium" | "low" | "none";
      summary: string;
      affected_clients?: Array<{
        contact_id?: string | null;
        name: string;
        why: string;
      }>;
      recommended_action: string | null;
    }>;
    // Surface only relevant findings on the dashboard. The 'none'
    // ones stay in the brief for audit but don't clutter the panel.
    const visible = findings.filter((f) => f.relevance !== "none");
    if (visible.length > 0) {
      groups.push({
        kind: "regulatory_updates",
        title: briefData.read_at
          ? "Regulatory analysis · Dante's findings"
          : "Regulatory analysis · new findings from Dante",
        count: visible.length,
        action: {
          label: "Open the full briefing",
          ask_prompt:
            `Walk me through your most recent regulatory briefing in detail. ` +
            `For each finding, expand on the implication, name any clients I ` +
            `should look at by hand, and tell me what to do this week. ` +
            `Cite the regulatory source for every claim.`,
        },
        items: visible.slice(0, 5).map((f) => ({
          id: f.item_id,
          label: f.summary,
          sublabel: [
            f.authority,
            f.relevance.toUpperCase(),
          ]
            .filter(Boolean)
            .join(" · "),
          when: briefData.generated_at,
          href: f.source_url,
          recommended_action: f.recommended_action,
          affected_clients: f.affected_clients ?? [],
        })),
      });
    }
  } else if ((regulatoryUpdates.count ?? 0) > 0) {
    // Fallback: no brief generated yet (cron hasn't run since these
    // items landed) but raw items exist. Show the old-style list +
    // ask-button so the user isn't blind until the next cron tick.
    const items = ((regulatoryUpdates.data || []) as Array<{
      id: string;
      authority: string;
      source_kind: string;
      source_url: string;
      title: string;
      published_at: string | null;
    }>).map((row) => ({
      id: row.id,
      label: row.title,
      sublabel: `${row.authority} · ${row.source_kind.replace(/_/g, " ")}`,
      when: row.published_at,
      href: row.source_url,
    }));
    const titleList = items
      .map((it, i) => `${i + 1}. ${it.label} (${it.sublabel})`)
      .join("\n");
    groups.push({
      kind: "regulatory_updates",
      title: "Regulatory updates since you were last here",
      count: regulatoryUpdates.count ?? 0,
      action: {
        label: "Ask Dante what these mean for my book",
        ask_prompt:
          `These regulatory updates landed since I last logged in:\n\n${titleList}\n\n` +
          `For each one that's relevant to my firm, briefly explain (a) what changed, ` +
          `(b) which of my clients or households it might affect (use memory.search and ` +
          `clients.query if needed), and (c) what concrete action — if any — I should ` +
          `take this week. Cite the regulatory source for each claim. Skip any that ` +
          `aren't actually relevant to my book.`,
      },
      items,
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

  // Unread regulatory briefs for this workspace — drives the
  // AppTopBar Ask button badge. Cheap count query.
  const { count: unreadBriefCount } = await supabaseAdmin
    .from("regulatory_briefs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("read_at", null);

  // Also surface the latest brief's id so the mark-read endpoint
  // can be called against a specific row when the user opens the
  // panel.
  const latest_brief_id = briefData?.id ?? null;

  return NextResponse.json({
    since,
    is_first_visit: isFirstVisit,
    groups,
    unread_brief_count: unreadBriefCount ?? 0,
    latest_brief_id,
  });
}
