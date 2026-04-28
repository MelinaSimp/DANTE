// GET /api/work/queue
//
// Unified work queue endpoint. Fans out across the five source
// tables that surface action items today, normalises each into a
// WorkItem, sorts by urgency, and returns one merged list. The /work
// page is the only consumer; bulk shape stays internal.
//
// Sources:
//   - property_documents.expires_at within HORIZON_DAYS  → "renewal"
//   - reminders status='draft'                           → "draft"
//   - reminders status='scheduled'                       → "scheduled"
//   - compliance_flags status='pending'                  → "flag"
//   - contacts with no notes in STALE_DAYS               → "stale"
//
// Urgency derivation lives here (not on the client) so different
// surfaces can share the same bucketing if needed later (e.g. a
// dashboard count, an email digest). See deriveUrgency() below.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const HORIZON_DAYS = 60;
const STALE_DAYS = 60;
const MAX_STALE = 10; // cap so the queue isn't 200 stale clients

export type WorkKind =
  | "renewal"
  | "draft"
  | "scheduled"
  | "flag"
  | "stale";

export type Urgency = "overdue" | "today" | "this_week" | "later";

export interface WorkItem {
  id: string;                  // composite: "<kind>:<source-uuid>"
  kind: WorkKind;
  urgency: Urgency;
  title: string;               // verb-led headline
  /** Deadline in ISO. Null = no hard deadline (e.g. stale signals,
   *  some compliance flags). */
  deadline: string | null;
  /** Small chips for context — contact name, property address,
   *  doc kind, source kind, severity. Order is meaningful: most
   *  important first (the queue UI may truncate at small widths). */
  chips: Array<{ label: string; tone?: "default" | "warn" | "danger" }>;
  /** Stake hint — what happens if ignored. Tooltip text. */
  stake: string;
  /** Where Open should link to. Always populated. */
  href: string;
  /** Which inline actions the queue UI should offer. v1 supports
   *  approve / snooze / dismiss / open — each kind picks a subset. */
  actions: Array<"approve" | "snooze" | "dismiss" | "open">;
  /** Carried verbatim from the source. The UI uses this for inline
   *  preview (e.g. the email subject for a draft). */
  preview?: string;
}

function deriveUrgency(deadline: string | null): Urgency {
  if (!deadline) return "later";
  const d = new Date(deadline).getTime();
  const now = Date.now();
  if (d < now) return "overdue";
  const tomorrow = new Date(); tomorrow.setHours(23, 59, 59, 999);
  if (d <= tomorrow.getTime()) return "today";
  const weekOut = now + 7 * 86400_000;
  if (d <= weekOut) return "this_week";
  return "later";
}

const URGENCY_RANK: Record<Urgency, number> = {
  overdue: 0,
  today: 1,
  this_week: 2,
  later: 3,
};

const STAKE_RANK: Record<WorkKind, number> = {
  // Within an urgency bucket, compliance > drafts (about-to-send) >
  // renewals (fixed deadline) > scheduled (already user-approved) >
  // stale (no hard deadline).
  flag: 0,
  draft: 1,
  renewal: 2,
  scheduled: 3,
  stale: 4,
};

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json([]);
  const wid = profile.workspace_id;

  const todayIso = new Date().toISOString().slice(0, 10);
  const horizonIso = new Date(Date.now() + HORIZON_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();

  const [
    { data: expiringDocs },
    { data: drafts },
    { data: scheduled },
    { data: flags },
    { data: contacts },
    { data: recentNotes },
  ] = await Promise.all([
    supabaseAdmin
      .from("property_documents")
      .select("id, property_id, title, doc_kind, expires_at")
      .eq("workspace_id", wid)
      .gte("expires_at", todayIso)
      .lte("expires_at", horizonIso)
      .order("expires_at", { ascending: true })
      .limit(50),
    supabaseAdmin
      .from("reminders")
      .select(
        "id, subject, reason, send_at, contact_id, property_id, property_document_id, source",
      )
      .eq("workspace_id", wid)
      .eq("status", "draft")
      .order("send_at", { ascending: true, nullsFirst: false })
      .limit(50),
    supabaseAdmin
      .from("reminders")
      .select("id, subject, send_at, contact_id, property_id, to_email")
      .eq("workspace_id", wid)
      .eq("status", "scheduled")
      .order("send_at", { ascending: true })
      .limit(50),
    supabaseAdmin
      .from("compliance_flags")
      .select("id, severity, message, source_type, source_id, rule_id, created_at")
      .eq("workspace_id", wid)
      .eq("status", "pending")
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("contacts")
      .select("id, name, email")
      .eq("workspace_id", wid),
    supabaseAdmin
      .from("notes")
      .select("contact_id, created_at")
      .eq("workspace_id", wid)
      .gte("created_at", staleCutoff),
  ]);

  // Resolve names/labels for foreign keys we'll surface as chips.
  const contactIds = new Set<string>();
  for (const r of drafts || []) if (r.contact_id) contactIds.add(r.contact_id);
  for (const r of scheduled || []) if (r.contact_id) contactIds.add(r.contact_id);
  const propIds = new Set<string>();
  for (const r of expiringDocs || []) propIds.add(r.property_id);
  for (const r of drafts || []) if (r.property_id) propIds.add(r.property_id);

  const [{ data: contactRows }, { data: propRows }] = await Promise.all([
    contactIds.size > 0
      ? supabaseAdmin
          .from("contacts")
          .select("id, name")
          .in("id", Array.from(contactIds))
      : Promise.resolve({ data: [] as any[] }),
    propIds.size > 0
      ? supabaseAdmin
          .from("properties")
          .select("id, address_line1, city")
          .in("id", Array.from(propIds))
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const contactName = new Map<string, string>(
    (contactRows || []).map((c: any) => [c.id, c.name as string]),
  );
  const propLabel = new Map<string, string>(
    (propRows || []).map((p: any) => [
      p.id,
      [p.address_line1, p.city].filter(Boolean).join(", ") as string,
    ]),
  );

  const items: WorkItem[] = [];

  // ── Renewals ────────────────────────────────────────────────
  for (const d of expiringDocs || []) {
    const addr = propLabel.get(d.property_id) || "(unknown property)";
    items.push({
      id: `renewal:${d.id}`,
      kind: "renewal",
      urgency: deriveUrgency(d.expires_at),
      title: `Renew ${humanKind(d.doc_kind)} — ${d.title}`,
      deadline: d.expires_at,
      chips: [
        { label: humanKind(d.doc_kind).toUpperCase() },
        { label: addr },
      ],
      stake: `Document expires ${d.expires_at} — renewal window starts now`,
      href: `/properties/${d.property_id}`,
      actions: ["open"],
    });
  }

  // ── Drafts ──────────────────────────────────────────────────
  for (const r of drafts || []) {
    const chips: WorkItem["chips"] = [];
    if (r.property_document_id) chips.push({ label: "RENEWAL DRAFT" });
    else if (r.source === "auto") chips.push({ label: "AUTO" });
    else chips.push({ label: "MANUAL" });
    if (r.contact_id && contactName.get(r.contact_id))
      chips.push({ label: contactName.get(r.contact_id)! });
    if (r.property_id && propLabel.get(r.property_id))
      chips.push({ label: propLabel.get(r.property_id)! });

    items.push({
      id: `draft:${r.id}`,
      kind: "draft",
      urgency: deriveUrgency(r.send_at),
      title: r.subject ? `Approve "${r.subject}"` : "Approve untitled draft",
      deadline: r.send_at,
      chips,
      stake: r.send_at
        ? `Will send ${new Date(r.send_at).toLocaleString()} once approved`
        : "No send time set yet — schedule on approve",
      href: `/reminders`,
      actions: ["approve", "dismiss", "open"],
      preview: r.reason || undefined,
    });
  }

  // ── Scheduled (low urgency, just visibility) ────────────────
  for (const r of scheduled || []) {
    const chips: WorkItem["chips"] = [{ label: "SCHEDULED" }];
    if (r.contact_id && contactName.get(r.contact_id))
      chips.push({ label: contactName.get(r.contact_id)! });
    if (r.property_id && propLabel.get(r.property_id))
      chips.push({ label: propLabel.get(r.property_id)! });
    if (r.to_email) chips.push({ label: `to ${r.to_email}` });

    items.push({
      id: `scheduled:${r.id}`,
      kind: "scheduled",
      urgency: deriveUrgency(r.send_at),
      title: r.subject ? `Sending "${r.subject}"` : "Sending untitled reminder",
      deadline: r.send_at,
      chips,
      stake: `Will fire automatically at ${
        r.send_at ? new Date(r.send_at).toLocaleString() : "scheduled time"
      }`,
      href: `/reminders`,
      actions: ["snooze", "dismiss", "open"],
    });
  }

  // ── Compliance flags ────────────────────────────────────────
  for (const f of flags || []) {
    const tone: "warn" | "danger" =
      f.severity === "block" ? "danger" : "warn";
    items.push({
      id: `flag:${f.id}`,
      kind: "flag",
      urgency: f.severity === "block" ? "today" : "this_week",
      title: f.rule_id ? `Resolve ${f.rule_id}` : "Resolve compliance flag",
      deadline: null,
      chips: [
        { label: f.severity?.toUpperCase() || "WARN", tone },
        { label: f.source_type?.toUpperCase() || "SOURCE" },
      ],
      stake:
        f.severity === "block"
          ? "Blocks the related send/save until resolved"
          : "Audit-trail flag — review and approve or dismiss",
      href: `/dante/compliance/${f.id}`,
      actions: ["dismiss", "open"],
      preview: f.message,
    });
  }

  // ── Stale relationships ─────────────────────────────────────
  // A contact is stale if there's no note (call summary or manual)
  // newer than STALE_DAYS. We reuse the dashboard's signal.
  const touched = new Set(
    (recentNotes || []).map((n: any) => n.contact_id).filter(Boolean) as string[],
  );
  const staleContacts = (contacts || [])
    .filter((c: any) => !touched.has(c.id) && c.email)
    .slice(0, MAX_STALE);
  for (const c of staleContacts) {
    items.push({
      id: `stale:${c.id}`,
      kind: "stale",
      urgency: "later",
      title: `Reach out to ${c.name || "(no name)"}`,
      deadline: null,
      chips: [
        { label: `${STALE_DAYS}+ DAYS QUIET` },
        { label: c.email || "" },
      ],
      stake: `No notes or activity in ${STALE_DAYS}+ days — relationship at risk`,
      href: `/client-details-overview?contact=${encodeURIComponent(c.name || "")}`,
      actions: ["open"],
    });
  }

  // ── Sort: urgency first, then per-kind stake rank, then deadline ──
  items.sort((a, b) => {
    const u = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (u !== 0) return u;
    const k = STAKE_RANK[a.kind] - STAKE_RANK[b.kind];
    if (k !== 0) return k;
    if (a.deadline && b.deadline)
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  return NextResponse.json(items);
}

function humanKind(kind: string): string {
  const m: Record<string, string> = {
    lease: "lease",
    insurance: "insurance",
    inspection: "inspection",
    disclosure: "disclosure",
    deed: "deed",
    hoa: "HOA doc",
    comp: "comp",
    photo: "photo",
    other: "document",
  };
  return m[kind] || "document";
}
