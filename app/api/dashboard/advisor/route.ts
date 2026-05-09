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

  // Workspace name + industry lookup. The industry value is what
  // drives the Dante↔Vergil branding swap on the dashboard top nav.
  let workspaceName = "Drift";
  let industry: string | null = null;
  if (wid) {
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("name, industry")
      .eq("id", wid)
      .maybeSingle();
    if (ws?.name) workspaceName = ws.name;
    if (ws?.industry) industry = ws.industry;
  }

  // ---- Fetch data in parallel ----
  const empty = <T,>(v: T[] | null | undefined): T[] => v ?? [];

  const [
    { data: appts },
    { data: notes },
    { data: recordings },
    { data: contacts },
    { data: documents },
    { data: calls7d },
  ] = await Promise.all([
    wid
      ? supabaseAdmin
          .from("appointments")
          .select("id, contact_id, caller_name, caller_phone, scheduled_at, service_type, status")
          .eq("workspace_id", wid)
          .gte("scheduled_at", now.toISOString())
          .lte("scheduled_at", endOfToday.toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(10)
      : Promise.resolve({ data: [] as any[] }),
    wid
      ? supabaseAdmin
          .from("notes")
          .select("id, contact_id, body, created_at")
          .eq("workspace_id", wid)
          .like("body", "📞 Call with%")
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] as any[] }),
    wid
      ? supabaseAdmin
          .from("call_recordings")
          .select("id, note_id")
          .eq("workspace_id", wid)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as any[] }),
    wid
      ? supabaseAdmin
          .from("contacts")
          .select("id, name")
          .eq("workspace_id", wid)
      : Promise.resolve({ data: [] as any[] }),
    wid
      ? supabaseAdmin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wid)
      : Promise.resolve({ data: [], count: 0 } as any),
    wid
      ? supabaseAdmin
          .from("call_recordings")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wid)
          .gte("created_at", sevenDaysAgo)
      : Promise.resolve({ data: [], count: 0 } as any),
  ]);

  // ---- Shape into sections ----
  const contactMap = new Map<string, string>();
  for (const c of empty<any>(contacts)) contactMap.set(c.id, c.name);

  // Today's appointments. For unknown-caller rows (contact_id null) we
  // prefer the heard name so the dashboard shows "Unknown · Bob" rather
  // than a bare "Unknown" — gives the advisor enough context to decide
  // whether to promote the caller.
  const today = empty<any>(appts)
    .filter((a) => a.status !== "cancelled")
    .map((a) => {
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

  // Recent calls — cross-reference notes with recordings for audit availability
  const recordingByNote = new Map<string, string>();
  for (const r of empty<any>(recordings)) {
    if (r.note_id) recordingByNote.set(r.note_id, r.id);
  }

  const recentCalls = empty<any>(notes).map((n) => ({
    id: n.id,
    contact_id: n.contact_id,
    contact_name: contactMap.get(n.contact_id) || null,
    created_at: n.created_at,
    body: n.body,
    has_audit: recordingByNote.has(n.id),
  }));

  // Flagged — placeholder until custodian + client-doc layers land.
  // For now, surface clients with no notes in 60 days as "stale".
  // This is intentionally a small, honest signal — not fake data.
  const flagged: Flag[] = [];
  if (wid) {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data: recentNotes } = await supabaseAdmin
      .from("notes")
      .select("contact_id, created_at")
      .eq("workspace_id", wid)
      .gte("created_at", sixtyDaysAgo);
    const touched = new Set(
      (recentNotes || []).map((n: any) => n.contact_id)
    );
    const staleContacts = empty<any>(contacts)
      .filter((c) => !touched.has(c.id))
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

  // Awaiting review — pending compliance flags + tasks awaiting approval.
  // Once the compliance scanner rolls out workspace-wide the task proxy
  // can go; for now it catches everything the scanner doesn't.
  let awaitingReview = 0;
  if (wid) {
    const [{ count: taskCount }, { count: flagCount }] = await Promise.all([
      supabaseAdmin
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wid)
        .in("status", ["pending", "review", "pending_approval"]),
      supabaseAdmin
        .from("compliance_flags")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wid)
        .eq("status", "pending"),
    ]);
    awaitingReview = (taskCount || 0) + (flagCount || 0);
  }

  // Verified % across recent recordings (real signal from grounded summaries)
  let verifiedPct: number | null = null;
  if (wid) {
    const { data: rec } = await supabaseAdmin
      .from("call_recordings")
      .select("summary_structured")
      .eq("workspace_id", wid)
      .not("summary_structured", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
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
  }

  const features = await getWorkspaceFeatures(wid);

  // ---- "What I noticed today" panel ------------------------------
  // Two streams D/V populates in the background that the user should
  // see at a glance every morning:
  //
  //   1. Pending reminder drafts — auto-proposed by the cron, awaiting
  //      review/approval. Surfaces the top 3 by send_at; full list at
  //      /reminders.
  //   2. Property documents expiring soon (next 30 days). Even if the
  //      cron has already drafted reminders for these, surfacing the
  //      raw expiries gives the user a clean place to see "leases up
  //      for renewal" without parsing email subjects.
  let pendingDraftsCount = 0;
  let topDrafts: Array<{
    id: string;
    subject: string | null;
    reason: string | null;
    send_at: string | null;
    contact_name: string | null;
    property_address: string | null;
    doc_kind: string | null;
  }> = [];
  let expiringDocsCount = 0;
  let topExpiring: Array<{
    id: string;
    property_id: string;
    title: string;
    doc_kind: string;
    expires_at: string;
    property_address: string | null;
  }> = [];
  // Generic notices the cron has materialized into dante_noticed —
  // surfaces stale clients, contradictions, RMD deadlines, etc. The
  // older direct-read streams above stay (they're still efficient);
  // dante_noticed is the home for the harder kinds.
  let noticedItems: Array<{
    id: string;
    kind: string;
    severity: "info" | "attention" | "urgent";
    title: string;
    body: string;
    target_kind: string | null;
    target_id: string | null;
    created_at: string;
  }> = [];

  if (wid) {
    const horizonIso = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const todayIso = new Date().toISOString().slice(0, 10);

    const [{ count: draftCount }, { data: drafts }, { count: expCount }, { data: expDocs }] =
      await Promise.all([
        supabaseAdmin
          .from("reminders")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wid)
          .eq("status", "draft"),
        supabaseAdmin
          .from("reminders")
          .select(
            "id, subject, reason, send_at, contact_id, property_id, property_document_id",
          )
          .eq("workspace_id", wid)
          .eq("status", "draft")
          .order("send_at", { ascending: true, nullsFirst: false })
          .limit(3),
        supabaseAdmin
          .from("property_documents")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wid)
          .gte("expires_at", todayIso)
          .lte("expires_at", horizonIso),
        supabaseAdmin
          .from("property_documents")
          .select("id, property_id, title, doc_kind, expires_at")
          .eq("workspace_id", wid)
          .gte("expires_at", todayIso)
          .lte("expires_at", horizonIso)
          .order("expires_at", { ascending: true })
          .limit(3),
      ]);

    pendingDraftsCount = draftCount || 0;
    expiringDocsCount = expCount || 0;

    // Enrich both lists with names/addresses so the dashboard doesn't
    // render bare uuids. One query per related table, max ~6 rows.
    const draftContactIds = (drafts || [])
      .map((d: any) => d.contact_id)
      .filter(Boolean) as string[];
    const draftPropertyIds = (drafts || [])
      .map((d: any) => d.property_id)
      .filter(Boolean) as string[];
    const expPropertyIds = (expDocs || []).map((d: any) => d.property_id);
    const propIds = Array.from(new Set([...draftPropertyIds, ...expPropertyIds]));
    const draftDocIds = (drafts || [])
      .map((d: any) => d.property_document_id)
      .filter(Boolean) as string[];

    const [{ data: relContacts }, { data: relProps }, { data: relDocs }] =
      await Promise.all([
        draftContactIds.length > 0
          ? supabaseAdmin
              .from("contacts")
              .select("id, name")
              .in("id", draftContactIds)
          : Promise.resolve({ data: [] as any[] }),
        propIds.length > 0
          ? supabaseAdmin
              .from("properties")
              .select("id, address_line1, city")
              .in("id", propIds)
          : Promise.resolve({ data: [] as any[] }),
        draftDocIds.length > 0
          ? supabaseAdmin
              .from("property_documents")
              .select("id, doc_kind")
              .in("id", draftDocIds)
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

    topDrafts = (drafts || []).map((d: any) => ({
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
    topExpiring = (expDocs || []).map((d: any) => ({
      id: d.id,
      property_id: d.property_id,
      title: d.title,
      doc_kind: d.doc_kind,
      expires_at: d.expires_at,
      property_address: propAddr.get(d.property_id) || null,
    }));

    // dante_noticed — generic proactive notices. Severity-ordered
    // (urgent first), then most-recent first within a severity. The
    // partial index on (workspace_id, severity, created_at desc)
    // matches this exact shape.
    const nowIso = new Date().toISOString();
    const { data: noticed } = await supabaseAdmin
      .from("dante_noticed")
      .select("id, kind, severity, title, body, target_kind, target_id, created_at")
      .eq("workspace_id", wid)
      .is("handled_at", null)
      .gt("expires_at", nowIso)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12);
    noticedItems = (noticed || []) as typeof noticedItems;

    // Regulatory analysis findings — used to live in the standalone
    // WhatChanged box. Now folded into the noticed panel as
    // regulatory_relevant rows so the dashboard has one place for
    // everything Dante/Vergil noticed. Pulls the latest brief and
    // surfaces each finding (relevance != 'none') as one item.
    const { data: latestBrief } = await supabaseAdmin
      .from("regulatory_briefs")
      .select("id, generated_at, findings, read_at")
      .eq("workspace_id", wid)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const briefRow = latestBrief as
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
      // Prepend regulatory items so they sit at the top — they're the
      // "since you were last here" signal that previously had its own
      // hero box; keeping that prominence inside the panel.
      noticedItems = [...regulatoryItems, ...noticedItems];
    }
  }

  return NextResponse.json({
    // Display name for the greeting — vertical-neutral fallback ("there")
    // so a real-estate agent doesn't get addressed as "Advisor" by default.
    advisorName: profile.full_name || user.email?.split("@")[0] || "there",
    workspaceName,
    industry,
    isSuperadmin: hasSuperadminAccess(user.email, profile.is_superadmin),
    features,
    today,
    awaitingReview,
    recentCalls,
    flagged,
    stats: {
      clients: empty<any>(contacts).length,
      calls7d: (calls7d as any)?.count || 0,
      documents: (documents as any)?.count || 0,
      verifiedPct,
    },
    noticedToday: {
      pendingDraftsCount,
      topDrafts,
      expiringDocsCount,
      topExpiring,
      items: noticedItems,
    },
  });
}
