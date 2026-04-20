// Advisor dashboard endpoint. Returns the four-section payload the
// Harvey-styled dashboard consumes:
//   • today           — appointments in the next ~24h
//   • awaitingReview  — compliance flags in pending status
//   • recentCalls     — last ~8 call recordings with audit availability
//   • flagged         — rule-based client watchlist (RMDs, age bands)
//   • stats           — top-of-page stat strip numbers
//
// Everything is workspace-scoped. Legacy /api/dashboard is preserved
// for the old analytics page at /dashboard/legacy.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

type Flag = {
  id: string;
  kind: "rmd" | "age-band" | "suitability" | "stale";
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

  // Workspace name lookup
  let workspaceName = "Drift";
  if (wid) {
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("name")
      .eq("id", wid)
      .maybeSingle();
    if (ws?.name) workspaceName = ws.name;
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
          .select("id, contact_id, scheduled_at, service_type, status")
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

  // Today's appointments
  const today = empty<any>(appts)
    .filter((a) => a.status !== "cancelled")
    .map((a) => ({
      id: a.id,
      contactName: contactMap.get(a.contact_id) || "Unknown",
      scheduledAt: a.scheduled_at,
      serviceType: a.service_type || "Meeting",
    }));

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

  // Custodian AUM — sum of the latest balance per account. We take
  // the most recent as_of per account (each daily snapshot is a full
  // value, not a delta). If all connections for this workspace use the
  // mock driver we label the number as Demo data in the UI so a CCO
  // doesn't mistake fixtures for a real book.
  let aumTotal: number | null = null;
  let aumAsOf: string | null = null;
  let aumIsDemo = false;
  let aumAccountCount = 0;
  if (wid) {
    const [{ data: connections }, { data: balances }] = await Promise.all([
      supabaseAdmin
        .from("custodian_connections")
        .select("provider, status")
        .eq("workspace_id", wid),
      supabaseAdmin
        .from("custodian_balances")
        .select("account_id, as_of, total_value")
        .eq("workspace_id", wid)
        .order("as_of", { ascending: false })
        .limit(500),
    ]);

    if (connections && connections.length > 0) {
      aumIsDemo = connections.every((c: any) => c.provider === "mock");
    }

    if (balances && balances.length > 0) {
      // Keep only the newest balance per account.
      const latestByAccount = new Map<
        string,
        { as_of: string; total_value: number }
      >();
      for (const b of balances as any[]) {
        const prev = latestByAccount.get(b.account_id);
        if (!prev || String(b.as_of) > String(prev.as_of)) {
          latestByAccount.set(b.account_id, {
            as_of: String(b.as_of),
            total_value: Number(b.total_value) || 0,
          });
        }
      }
      aumAccountCount = latestByAccount.size;
      aumTotal = 0;
      for (const v of latestByAccount.values()) {
        aumTotal += v.total_value;
        if (!aumAsOf || v.as_of > aumAsOf) aumAsOf = v.as_of;
      }
    }
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

  return NextResponse.json({
    advisorName: profile.full_name || user.email?.split("@")[0] || "Advisor",
    workspaceName,
    isSuperadmin: hasSuperadminAccess(user.email, profile.is_superadmin),
    today,
    awaitingReview,
    recentCalls,
    flagged,
    stats: {
      clients: empty<any>(contacts).length,
      calls7d: (calls7d as any)?.count || 0,
      documents: (documents as any)?.count || 0,
      verifiedPct,
      aumTotal,
      aumAsOf,
      aumIsDemo,
      aumAccountCount,
    },
  });
}
