// app/api/dante/workflows/[workflowId]/impact/route.ts
//
// GET → "what has this workflow actually done?" — derived from
// existing run logs so there's no separate table to keep in sync.
//
// We scan the last 200 successful runs, walk each log entry, and pull
// contact_ids out of:
//   • query_clients outputs       (contacts[].id)
//   • update_contact outputs      (contact.id)
//   • send_email with to: email   (join by contacts.email)
//
// Then for each unique contact we enrich with:
//   • name/email from contacts
//   • current brief risk_level (if any)
//
// Risk-level *delta* (was healthy → now watch) requires a dated brief
// snapshot at the time of touch, which we don't store yet. We expose
// risk_at_last_touch as null in that case rather than fabricate — the
// page calls this out explicitly.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface LogEntry {
  step_id?: string;
  step_type?: string;
  status?: string;
  output?: unknown;
}

interface TouchedContact {
  contact_id: string;
  name: string | null;
  email: string | null;
  first_touched_at: string | null;
  last_touched_at: string | null;
  touch_count: number;
  current_risk: string | null;
  last_brief_at: string | null;
  actions: {
    queried: number;
    updated: number;
    emailed: number;
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const { data: workflow } = await supabaseAdmin
    .from("dante_workflows")
    .select("id, name, description, enabled, created_at")
    .eq("id", workflowId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: runs } = await supabaseAdmin
    .from("dante_workflow_runs")
    .select("id, status, started_at, finished_at, log, error")
    .eq("workflow_id", workflowId)
    .eq("workspace_id", profile.workspace_id)
    .order("started_at", { ascending: false })
    .limit(200);

  const runRows = runs || [];

  // ── Walk logs ────────────────────────────────────────────
  // key = contact_id; collect actions + touch timestamps
  type Agg = {
    first: string | null;
    last: string | null;
    emails: Set<string>;
    actions: { queried: number; updated: number; emailed: number };
  };
  const byContact = new Map<string, Agg>();
  const emailsFromEmailSteps = new Set<string>();

  const bump = (id: string, at: string | null, which: keyof Agg["actions"]) => {
    let a = byContact.get(id);
    if (!a) {
      a = {
        first: at,
        last: at,
        emails: new Set(),
        actions: { queried: 0, updated: 0, emailed: 0 },
      };
      byContact.set(id, a);
    }
    if (at) {
      if (!a.first || at < a.first) a.first = at;
      if (!a.last || at > a.last) a.last = at;
    }
    a.actions[which] += 1;
  };

  let total_runs_considered = 0;
  let successful_runs = 0;
  let errored_runs = 0;
  let total_emails_simulated_or_sent = 0;
  let total_updates = 0;
  const runs_with_empty_queries: string[] = [];

  for (const run of runRows) {
    total_runs_considered++;
    if (run.status === "success") successful_runs++;
    else if (run.status === "error") errored_runs++;
    const at = run.finished_at || run.started_at || null;
    const log: LogEntry[] = Array.isArray(run.log) ? (run.log as LogEntry[]) : [];
    let runMatchedAnyContact = false;

    for (const entry of log) {
      if (!isObj(entry) || entry.status !== "success") continue;
      const out = entry.output;

      if (entry.step_type === "query_clients" && isObj(out)) {
        const contacts = Array.isArray(out.contacts) ? out.contacts : [];
        for (const c of contacts) {
          if (isObj(c) && typeof c.id === "string") {
            bump(c.id, at, "queried");
            runMatchedAnyContact = true;
          }
        }
      } else if (entry.step_type === "update_contact" && isObj(out)) {
        total_updates += 1;
        const c = isObj(out.contact) ? out.contact : null;
        if (c && typeof c.id === "string") {
          bump(c.id, at, "updated");
          runMatchedAnyContact = true;
        }
      } else if (entry.step_type === "send_email" && isObj(out)) {
        total_emails_simulated_or_sent += 1;
        // Real path exposes { to, email_id }. Simulated path exposes
        // { simulated, would_have: { to } }. We resolve either to an
        // address and, below, join to contacts by email.
        let to: string | null = null;
        if (typeof out.to === "string") to = out.to;
        else if (isObj(out.would_have) && typeof out.would_have.to === "string") {
          to = out.would_have.to;
        }
        if (to) emailsFromEmailSteps.add(to.toLowerCase());
      }
    }

    if (!runMatchedAnyContact && run.status === "success") {
      runs_with_empty_queries.push(run.id);
    }
  }

  // Resolve email→contact for send_email steps that didn't previously
  // attribute via query_clients. One bounded query by email list.
  const emailList = Array.from(emailsFromEmailSteps);
  if (emailList.length > 0) {
    const { data: emailContacts } = await supabaseAdmin
      .from("contacts")
      .select("id, email")
      .eq("workspace_id", profile.workspace_id)
      .in("email", emailList);
    for (const c of emailContacts || []) {
      if (!c.id) continue;
      bump(c.id, null, "emailed");
    }
  }

  // ── Enrich contacts ─────────────────────────────────────
  const contactIds = Array.from(byContact.keys());
  const enriched: TouchedContact[] = [];

  if (contactIds.length > 0) {
    const [contactsRes, briefsRes] = await Promise.all([
      supabaseAdmin
        .from("contacts")
        .select("id, name, email")
        .eq("workspace_id", profile.workspace_id)
        .in("id", contactIds),
      supabaseAdmin
        .from("dante_briefs")
        .select("contact_id, risk_level, generated_at")
        .eq("workspace_id", profile.workspace_id)
        .in("contact_id", contactIds),
    ]);

    const contactById = new Map<string, { name: string | null; email: string | null }>();
    for (const c of contactsRes.data || []) {
      contactById.set(c.id, { name: c.name ?? null, email: c.email ?? null });
    }

    const briefByContact = new Map<string, { risk_level: string; generated_at: string }>();
    for (const b of briefsRes.data || []) {
      const prev = briefByContact.get(b.contact_id);
      if (!prev || b.generated_at > prev.generated_at) {
        briefByContact.set(b.contact_id, {
          risk_level: b.risk_level,
          generated_at: b.generated_at,
        });
      }
    }

    for (const [id, agg] of byContact) {
      const meta = contactById.get(id);
      const brief = briefByContact.get(id);
      enriched.push({
        contact_id: id,
        name: meta?.name ?? null,
        email: meta?.email ?? null,
        first_touched_at: agg.first,
        last_touched_at: agg.last,
        touch_count:
          agg.actions.queried + agg.actions.updated + agg.actions.emailed,
        current_risk: brief?.risk_level ?? null,
        last_brief_at: brief?.generated_at ?? null,
        actions: agg.actions,
      });
    }

    enriched.sort((a, b) => {
      const at = a.last_touched_at || "";
      const bt = b.last_touched_at || "";
      return bt.localeCompare(at);
    });
  }

  // ── Risk distribution summary across touched ───────────
  const risk_distribution = { critical: 0, act_now: 0, watch: 0, healthy: 0, unknown: 0 };
  for (const c of enriched) {
    const k = (c.current_risk as keyof typeof risk_distribution) || "unknown";
    if (k in risk_distribution) risk_distribution[k]++;
    else risk_distribution.unknown++;
  }

  return NextResponse.json({
    workflow,
    summary: {
      total_runs_considered,
      successful_runs,
      errored_runs,
      unique_contacts_touched: enriched.length,
      total_updates,
      total_emails_simulated_or_sent,
      runs_with_no_contacts: runs_with_empty_queries.length,
      risk_distribution,
    },
    contacts: enriched.slice(0, 200),
    caveats: {
      risk_snapshot_at_touch: "not_tracked",
      note:
        "current_risk reflects the latest brief for each contact, not their risk level at the time the workflow touched them.",
      email_attribution:
        "send_email steps are matched to contacts by email address; a touch is counted even when the email was simulated in a Test run.",
    },
  });
}
