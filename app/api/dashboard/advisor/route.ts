// Advisor dashboard endpoint. Returns the four-section payload the
// Harvey-styled dashboard consumes:
//   • today           — appointments in the next ~24h
//   • awaitingReview  — compliance flags in pending status
//   • recentCalls     — last ~8 call recordings with audit availability
//   • flagged         — "needs attention" list: clients going quiet
//   • stats           — top-of-page stat strip numbers
//
// Everything is workspace-scoped. Legacy /api/dashboard is preserved
// for the old analytics page at /dashboard/legacy.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { getWorkspaceFeatures } from "@/lib/features/server";

export const dynamic = "force-dynamic";

// Single "quiet client" signal — no activity in 60 days. The earlier
// multi-kind union (rmd/age-band/suitability) was aspirational; nothing
// wrote those kinds and exposing them silently promised surveillance
// the product couldn't deliver. Re-expand when real custodian data
// (DOB, account_type, balance) is wired.
type Flag = {
  id: string;
  kind: "stale";
  client: string;
  detail: string;
  dueAt?: string | null;
};

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, full_name, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id && !profile?.is_superadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const wid = profile.workspace_id;

  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString();
  const horizonIso = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);
  const nowIso = now.toISOString();

  const empty = <T,>(v: T[] | null | undefined): T[] => v ?? [];
  const noop = Promise.resolve({ data: [] as any[], count: 0 } as any);

  // ---- Single parallel fetch: all workspace-dependent queries ----
  const [
    wsResult,
    apptsResult,
    notesResult,
    recordingsResult,
    contactsResult,
    documentsResult,
    calls7dResult,
    recentNotesResult,
    taskCountResult,
    flagCountResult,
    verifiedRecResult,
    draftCountResult,
    draftsResult,
    expCountResult,
    expDocsResult,
    noticedResult,
    briefResult,
    proposalsResult,
    workflowRunsResult,
    inboundEmailsResult,
    sentEmailsResult,
    smsResult,
    allWorkflowsResult,
    featuresResult,
  ] = await Promise.all([
    wid
      ? supabaseAdmin.from("workspaces").select("name, industry").eq("id", wid).maybeSingle()
      : Promise.resolve({ data: null }),
    wid
      ? supabaseAdmin
          .from("appointments")
          .select("id, contact_id, caller_name, caller_phone, scheduled_at, service_type, status")
          .eq("workspace_id", wid)
          .gte("scheduled_at", nowIso)
          .lte("scheduled_at", endOfToday.toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(10)
      : noop,
    wid
      ? supabaseAdmin
          .from("notes")
          .select("id, contact_id, body, created_at")
          .eq("workspace_id", wid)
          .like("body", "Call with%")
          .order("created_at", { ascending: false })
          .limit(8)
      : noop,
    wid
      ? supabaseAdmin
          .from("call_recordings")
          .select("id, note_id")
          .eq("workspace_id", wid)
          .order("created_at", { ascending: false })
          .limit(50)
      : noop,
    wid
      ? supabaseAdmin.from("contacts").select("id, name").eq("workspace_id", wid)
      : noop,
    wid
      ? supabaseAdmin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wid)
      : noop,
    wid
      ? supabaseAdmin
          .from("call_recordings")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wid)
          .gte("created_at", sevenDaysAgo)
      : noop,
    wid
      ? supabaseAdmin
          .from("notes")
          .select("contact_id, created_at")
          .eq("workspace_id", wid)
          .gte("created_at", sixtyDaysAgo)
      : noop,
    wid
      ? supabaseAdmin
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wid)
          .in("status", ["pending", "review", "pending_approval"])
      : noop,
    wid
      ? supabaseAdmin
          .from("compliance_flags")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wid)
          .eq("status", "pending")
      : noop,
    wid
      ? supabaseAdmin
          .from("call_recordings")
          .select("summary_structured")
          .eq("workspace_id", wid)
          .not("summary_structured", "is", null)
          .order("created_at", { ascending: false })
          .limit(20)
      : noop,
    wid
      ? supabaseAdmin
          .from("reminders")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wid)
          .eq("status", "draft")
      : noop,
    wid
      ? supabaseAdmin
          .from("reminders")
          .select("id, subject, reason, send_at, contact_id, property_id, property_document_id")
          .eq("workspace_id", wid)
          .eq("status", "draft")
          .order("send_at", { ascending: true, nullsFirst: false })
          .limit(3)
      : noop,
    wid
      ? supabaseAdmin
          .from("property_documents")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wid)
          .gte("expires_at", todayIso)
          .lte("expires_at", horizonIso)
      : noop,
    wid
      ? supabaseAdmin
          .from("property_documents")
          .select("id, property_id, title, doc_kind, expires_at")
          .eq("workspace_id", wid)
          .gte("expires_at", todayIso)
          .lte("expires_at", horizonIso)
          .order("expires_at", { ascending: true })
          .limit(3)
      : noop,
    wid
      ? supabaseAdmin
          .from("dante_noticed")
          .select("id, kind, severity, title, body, target_kind, target_id, created_at, citations")
          .eq("workspace_id", wid)
          .is("handled_at", null)
          .gt("expires_at", nowIso)
          .order("severity", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(12)
      : noop,
    wid
      ? supabaseAdmin
          .from("regulatory_briefs")
          .select("id, generated_at, findings, read_at")
          .eq("workspace_id", wid)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    wid
      ? supabaseAdmin
          .from("dante_workflows")
          .select("id, name, description, trigger, created_at")
          .eq("workspace_id", wid)
          .eq("proposal_state", "pending")
          .order("created_at", { ascending: false })
          .limit(6)
      : noop,
    // Workflow runs — last 12 completed/failed/running with full output
    wid
      ? supabaseAdmin
          .from("dante_workflow_runs")
          .select("id, workflow_id, status, error, output, created_at, completed_at, started_at, finished_at")
          .eq("workspace_id", wid)
          .in("status", ["completed", "failed", "running"])
          .order("created_at", { ascending: false })
          .limit(12)
      : noop,
    // Inbound emails
    wid
      ? supabaseAdmin
          .from("customer_emails")
          .select("id, from_address, subject, category, urgency, created_at")
          .eq("workspace_id", wid)
          .order("created_at", { ascending: false })
          .limit(8)
      : noop,
    // Sent emails
    wid
      ? supabaseAdmin
          .from("sent_emails")
          .select("id, to_address, subject, created_at")
          .eq("workspace_id", wid)
          .order("created_at", { ascending: false })
          .limit(8)
      : noop,
    // SMS messages
    wid
      ? supabaseAdmin
          .from("sms_messages")
          .select("id, direction, body, from_number, to_number, created_at")
          .eq("workspace_id", wid)
          .order("created_at", { ascending: false })
          .limit(8)
      : noop,
    // All workspace workflows — for usage insights on the dashboard
    wid
      ? supabaseAdmin
          .from("dante_workflows")
          .select("id, name, enabled, created_at, proposal_state")
          .eq("workspace_id", wid)
      : noop,
    getWorkspaceFeatures(wid),
  ]);

  // ---- Workspace info ----
  let workspaceName = "Drift";
  let industry: string | null = null;
  if (wsResult.data) {
    if (wsResult.data.name) workspaceName = wsResult.data.name;
    if (wsResult.data.industry) industry = wsResult.data.industry;
  }

  // ---- Contacts map ----
  const contacts = contactsResult.data;
  const contactMap = new Map<string, string>();
  for (const c of empty<any>(contacts)) contactMap.set(c.id, c.name);

  // ---- Today's appointments ----
  const today = empty<any>(apptsResult.data)
    .filter((a: any) => a.status !== "cancelled")
    .map((a: any) => {
      const fromContact = a.contact_id ? contactMap.get(a.contact_id) : null;
      const heardName = typeof a.caller_name === "string" ? a.caller_name.trim() : "";
      const contactName =
        fromContact ||
        (heardName ? `Unknown · ${heardName}` : "Unknown caller");
      return {
        id: a.id,
        contactName,
        scheduledAt: a.scheduled_at,
        serviceType: a.service_type || "Meeting",
      };
    });

  // ---- Recent calls ----
  const recordingByNote = new Map<string, string>();
  for (const r of empty<any>(recordingsResult.data)) {
    if (r.note_id) recordingByNote.set(r.note_id, r.id);
  }
  const recentCalls = empty<any>(notesResult.data).map((n: any) => ({
    id: n.id,
    contact_id: n.contact_id,
    contact_name: contactMap.get(n.contact_id) || null,
    created_at: n.created_at,
    body: n.body,
    has_audit: recordingByNote.has(n.id),
  }));

  // ---- Flagged (stale clients) ----
  const flagged: Flag[] = [];
  if (wid) {
    const touched = new Set(
      (recentNotesResult.data || []).map((n: any) => n.contact_id)
    );
    const staleContacts = empty<any>(contacts)
      .filter((c: any) => !touched.has(c.id))
      .slice(0, 5);
    for (const c of staleContacts) {
      flagged.push({
        id: `stale-${c.id}`,
        kind: "stale",
        client: c.name,
        detail: "No notes or activity in the last 60 days.",
      });
    }
  }

  // ---- Awaiting review ----
  const awaitingReview = (taskCountResult.count || 0) + (flagCountResult.count || 0);

  // ---- Verified % ----
  let verifiedPct: number | null = null;
  const rec = verifiedRecResult.data;
  if (rec && rec.length > 0) {
    let v = 0;
    let t = 0;
    for (const r of rec as any[]) {
      const s = r.summary_structured;
      if (s && typeof s.verified_count === "number" && s.total_claims > 0) {
        v += s.verified_count;
        t += s.total_claims;
      }
    }
    verifiedPct = t > 0 ? Math.round((v / t) * 100) : null;
  }

  // ---- Noticed panel: drafts + expiring docs ----
  const pendingDraftsCount = draftCountResult.count || 0;
  const expiringDocsCount = expCountResult.count || 0;
  const drafts = draftsResult.data || [];
  const expDocs = expDocsResult.data || [];

  // Enrichment round — needs IDs from the parallel fetch above
  const draftContactIds = drafts
    .map((d: any) => d.contact_id)
    .filter(Boolean) as string[];
  const draftPropertyIds = drafts
    .map((d: any) => d.property_id)
    .filter(Boolean) as string[];
  const expPropertyIds = expDocs.map((d: any) => d.property_id);
  const propIds = Array.from(new Set([...draftPropertyIds, ...expPropertyIds]));
  const draftDocIds = drafts
    .map((d: any) => d.property_document_id)
    .filter(Boolean) as string[];

  const [{ data: relContacts }, { data: relProps }, { data: relDocs }] =
    await Promise.all([
      draftContactIds.length > 0
        ? supabaseAdmin.from("contacts").select("id, name").in("id", draftContactIds)
        : Promise.resolve({ data: [] as any[] }),
      propIds.length > 0
        ? supabaseAdmin.from("properties").select("id, address_line1, city").in("id", propIds)
        : Promise.resolve({ data: [] as any[] }),
      draftDocIds.length > 0
        ? supabaseAdmin.from("property_documents").select("id, doc_kind").in("id", draftDocIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

  const contactName = new Map<string, string>(
    (relContacts || []).map((c: any) => [c.id, c.name as string]),
  );
  const propAddr = new Map<string, string>(
    (relProps || []).map((p: any) => [
      p.id,
      [p.address_line1, p.city].filter(Boolean).join(", ") as string,
    ]),
  );
  const docKindById = new Map<string, string>(
    (relDocs || []).map((d: any) => [d.id, d.doc_kind as string]),
  );

  const topDrafts = drafts.map((d: any) => ({
    id: d.id,
    subject: d.subject,
    reason: d.reason,
    send_at: d.send_at,
    contact_name: d.contact_id ? contactName.get(d.contact_id) || null : null,
    property_address: d.property_id ? propAddr.get(d.property_id) || null : null,
    doc_kind: d.property_document_id
      ? docKindById.get(d.property_document_id) || null
      : null,
  }));
  const topExpiring = expDocs.map((d: any) => ({
    id: d.id,
    property_id: d.property_id,
    title: d.title,
    doc_kind: d.doc_kind,
    expires_at: d.expires_at,
    property_address: propAddr.get(d.property_id) || null,
  }));

  // ---- Noticed items: dante_noticed + regulatory + proposals ----
  let noticedItems: Array<{
    id: string;
    kind: string;
    severity: "info" | "attention" | "urgent";
    title: string;
    body: string;
    target_kind: string | null;
    target_id: string | null;
    created_at: string;
    citations?: unknown[];
  }> = (noticedResult.data || []) as any;

  const briefRow = briefResult.data as
    | { id: string; generated_at: string; findings: unknown; read_at: string | null }
    | null;
  if (briefRow && Array.isArray(briefRow.findings)) {
    const findings = briefRow.findings as Array<{
      item_id: string;
      authority: string;
      title: string;
      source_url: string;
      relevance: "high" | "medium" | "low" | "none";
      summary: string;
      recommended_action: string | null;
    }>;
    const visible = findings.filter((f) => f.relevance !== "none").slice(0, 6);
    const regulatoryItems = visible.map((f) => ({
      id: `reg:${f.item_id}`,
      kind: "regulatory_relevant",
      severity:
        f.relevance === "high"
          ? "urgent"
          : f.relevance === "medium"
            ? "attention"
            : "info",
      title: `${f.authority} · ${f.title}`,
      body: f.summary,
      target_kind: "regulatory_url" as string,
      target_id: f.source_url,
      created_at: briefRow.generated_at,
    })) as typeof noticedItems;
    noticedItems = [...regulatoryItems, ...noticedItems];
  }

  const pendingProposals = proposalsResult.data;
  if (pendingProposals && pendingProposals.length > 0) {
    const proposalItems = (
      pendingProposals as Array<{
        id: string;
        name: string;
        description: string | null;
        trigger: { type?: string } | null;
        created_at: string;
      }>
    ).map((p) => {
      const triggerType = (p.trigger?.type as string) || "manual";
      const triggerLabel =
        triggerType === "cron"
          ? "recurring"
          : triggerType === "at"
            ? "one-time"
            : triggerType === "webhook"
              ? "external trigger"
              : "manual";
      return {
        id: `proposal:${p.id}`,
        kind: "workflow_suggested",
        severity: "attention" as const,
        title: `Proposed workflow: ${p.name}`,
        body: `${p.description || ""}${p.description ? " " : ""}(${triggerLabel}). Accept to enable.`,
        target_kind: "workflow_proposal" as string,
        target_id: p.id,
        created_at: p.created_at,
      } as (typeof noticedItems)[number];
    });
    noticedItems = [...proposalItems, ...noticedItems];
  }

  // ---- Recent activity feed: workflow runs + emails + SMS ----
  // Merge into a single chronological stream so the dashboard always
  // shows something when the workspace has had any activity at all.
  type ActivityItem = {
    id: string;
    kind: "workflow" | "email_in" | "email_out" | "sms_in" | "sms_out";
    headline: string;
    detail: string | null;
    status?: string | null;
    timestamp: string;
  };

  const activityItems: ActivityItem[] = [];

  // Workflow runs — enrich with workflow names + extract output summary
  const wfRuns = empty<any>(workflowRunsResult.data);

  // Helper: extract the last meaningful text from a workflow output.
  // Each step can have a .text field; we want the final one (usually
  // the format/digest/score step). Truncate to ~300 chars for the
  // dashboard card and strip markdown headers for readability.
  function extractOutputSummary(output: Record<string, any> | null): string | null {
    if (!output || typeof output !== "object") return null;
    let lastText: string | null = null;
    for (const v of Object.values(output)) {
      if (v && typeof v === "object" && typeof v.text === "string" && v.text.trim()) {
        lastText = v.text;
      }
    }
    if (!lastText) return null;
    // Strip markdown headers and emoji for dashboard display
    let clean = lastText
      .replace(/^#{1,4}\s+/gm, "")
      .replace(/[*_]{1,2}/g, "")
      .replace(/---+/g, "")
      .replace(/\n{2,}/g, "\n")
      .trim();
    if (clean.length > 300) clean = clean.slice(0, 297) + "...";
    return clean;
  }

  type WorkflowResult = {
    id: string;
    workflow_id: string;
    workflow_name: string;
    status: string;
    error: string | null;
    summary: string | null;
    started_at: string | null;
    finished_at: string | null;
    created_at: string;
  };
  const workflowResults: WorkflowResult[] = [];

  if (wfRuns.length > 0) {
    const wfIds = Array.from(new Set(wfRuns.map((r: any) => r.workflow_id).filter(Boolean))) as string[];
    const { data: wfDefs } = wfIds.length > 0
      ? await supabaseAdmin
          .from("dante_workflows")
          .select("id, name")
          .in("id", wfIds)
      : { data: [] };
    const wfName = new Map((wfDefs || []).map((w: any) => [w.id, w.name as string]));

    for (const r of wfRuns) {
      const name = wfName.get(r.workflow_id) || "Workflow";
      const summary = extractOutputSummary(r.output);

      workflowResults.push({
        id: r.id,
        workflow_id: r.workflow_id,
        workflow_name: name,
        status: r.status,
        error: r.error || null,
        summary,
        started_at: r.started_at,
        finished_at: r.finished_at || r.completed_at,
        created_at: r.created_at,
      });

      activityItems.push({
        id: `wf:${r.id}`,
        kind: "workflow",
        headline: name,
        detail: r.status === "failed" ? (r.error || "Failed") : null,
        status: r.status,
        timestamp: r.completed_at || r.created_at,
      });
    }
  }

  // Inbound emails
  for (const e of empty<any>(inboundEmailsResult.data)) {
    activityItems.push({
      id: `ein:${e.id}`,
      kind: "email_in",
      headline: e.subject || "(no subject)",
      detail: e.from_address || null,
      status: e.urgency === "high" ? "urgent" : null,
      timestamp: e.created_at,
    });
  }

  // Sent emails
  for (const e of empty<any>(sentEmailsResult.data)) {
    activityItems.push({
      id: `eout:${e.id}`,
      kind: "email_out",
      headline: e.subject || "(no subject)",
      detail: e.to_address || null,
      status: null,
      timestamp: e.created_at,
    });
  }

  // SMS
  for (const s of empty<any>(smsResult.data)) {
    const isInbound = s.direction === "inbound";
    activityItems.push({
      id: `sms:${s.id}`,
      kind: isInbound ? "sms_in" : "sms_out",
      headline: (s.body || "").slice(0, 120) || "(empty)",
      detail: isInbound ? s.from_number : s.to_number,
      status: null,
      timestamp: s.created_at,
    });
  }

  // Sort by timestamp descending, cap at 20
  activityItems.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const recentActivity = activityItems.slice(0, 20);

  // ---- Usage insights ----
  // Computed from workflow run history and workflow definitions.
  // Shows usage patterns, failure warnings, and workflow status
  // on the "What Dante noticed" panel.
  type UsageInsight = {
    id: string;
    kind: "usage_pattern" | "workflow_tip" | "prompt_hint";
    title: string;
    body: string;
  };
  const usageInsights: UsageInsight[] = [];

  // Aggregate run counts per workflow
  if (workflowResults.length > 0) {
    const wfCounts = new Map<string, { name: string; total: number; failed: number; wfId: string }>();
    for (const wr of workflowResults) {
      const key = wr.workflow_id;
      const existing = wfCounts.get(key) || { name: wr.workflow_name, total: 0, failed: 0, wfId: key };
      existing.total++;
      if (wr.status === "failed") existing.failed++;
      wfCounts.set(key, existing);
    }

    // Most active workflow
    const sorted = [...wfCounts.entries()].sort((a, b) => b[1].total - a[1].total);
    if (sorted.length > 0 && sorted[0][1].total >= 2) {
      const top = sorted[0][1];
      usageInsights.push({
        id: "usage-top-wf",
        kind: "usage_pattern",
        title: `${top.name} is your most active workflow`,
        body: `${top.total} run${top.total === 1 ? "" : "s"} recently.${top.failed > 0 ? ` ${top.failed} failed -- review the configuration.` : ""}`,
      });
    }

    // Failure rate warnings
    for (const [, wf] of wfCounts) {
      if (wf.failed > 0 && wf.total >= 2 && wf.failed / wf.total >= 0.5) {
        usageInsights.push({
          id: `fail-${wf.wfId}`,
          kind: "prompt_hint",
          title: `${wf.name} is failing often`,
          body: `${wf.failed} of ${wf.total} recent runs failed. Check input parameters or workflow steps.`,
        });
      }
    }
  }

  // Workflow enable/disable status
  const activeWfs = (allWorkflowsResult.data || []).filter(
    (w: any) => w.proposal_state !== "pending",
  );
  if (activeWfs.length > 0) {
    const enabled = activeWfs.filter((w: any) => w.enabled);
    const disabled = activeWfs.filter((w: any) => !w.enabled);

    // Workflows that have never been run
    const ranIds = new Set(workflowResults.map((r) => r.workflow_id));
    const neverRan = enabled.filter((w: any) => !ranIds.has(w.id));
    if (neverRan.length > 0 && neverRan.length <= 3) {
      for (const w of neverRan) {
        usageInsights.push({
          id: `idle-${w.id}`,
          kind: "workflow_tip",
          title: `${w.name} has not been run yet`,
          body: "This workflow is enabled but has no recent runs. Try running it to verify it works.",
        });
      }
    } else if (neverRan.length > 3) {
      usageInsights.push({
        id: "idle-many",
        kind: "workflow_tip",
        title: `${neverRan.length} enabled workflows have no recent runs`,
        body: "Visit Workflows to test them or disable the ones you no longer need.",
      });
    }

    if (disabled.length > 0 && enabled.length === 0) {
      usageInsights.push({
        id: "usage-all-disabled",
        kind: "workflow_tip",
        title: `All ${disabled.length} workflow${disabled.length === 1 ? "" : "s"} disabled`,
        body: "Enable workflows to automate your analysis. Visit the Workflows page to review and turn them on.",
      });
    }
  }

  return NextResponse.json({
    advisorName: profile.full_name || user.email?.split("@")[0] || "there",
    workspaceName,
    industry,
    isSuperadmin: hasSuperadminAccess(user.email, profile.is_superadmin),
    features: featuresResult,
    today,
    awaitingReview,
    recentCalls,
    flagged,
    recentActivity,
    workflowResults,
    stats: {
      clients: empty<any>(contacts).length,
      calls7d: (calls7dResult as any)?.count || 0,
      documents: (documentsResult as any)?.count || 0,
      verifiedPct,
    },
    noticedToday: {
      pendingDraftsCount,
      topDrafts,
      expiringDocsCount,
      topExpiring,
      items: noticedItems,
    },
    usageInsights,
  });
}
