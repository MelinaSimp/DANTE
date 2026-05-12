// app/api/reminders/route.ts — list + create

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const VALID_STATUSES = ["draft", "scheduled", "sent", "cancelled", "failed"];

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json([]);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  // Some realtor-vertical columns (property_document_id,
  // appointment_id, source, channel, send_error, reason) may not
  // exist on advisor-only Supabase instances that never ran the
  // realtor migrations. We try the rich SELECT first; on any
  // column-mismatch error we fall back to the core columns so the
  // page renders instead of 500-ing.
  const RICH_SELECT =
    "id, source, contact_id, property_id, appointment_id, property_document_id, channel, to_email, subject, body, send_at, status, sent_at, send_error, reason, created_at, updated_at";
  const CORE_SELECT =
    "id, contact_id, to_email, subject, body, send_at, status, sent_at, created_at, updated_at";

  async function runQuery(selectCols: string) {
    let q = supabase
      .from("reminders")
      .select(selectCols)
      .eq("workspace_id", profile!.workspace_id)
      .order("send_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (status && VALID_STATUSES.includes(status)) q = q.eq("status", status);
    return q;
  }

  let { data, error } = await runQuery(RICH_SELECT);
  if (error) {
    console.warn(
      "reminders GET: rich select failed, retrying with core columns:",
      error.message,
    );
    const fallback = await runQuery(CORE_SELECT);
    data = fallback.data;
    error = fallback.error;
  }
  if (error) {
    console.error("reminders GET:", error);
    return NextResponse.json(
      { error: "Failed", detail: error.message },
      { status: 500 },
    );
  }

  // Enrich with related entity labels so the triage list can render
  // "123 Main St -- lease" without a fan-out of follow-up requests.
  // The full lookup runs through supabase (RLS-bound to this user's
  // workspace), and only over the ids actually referenced in the
  // result set.
  const rows = data || [];
  const contactIds = Array.from(
    new Set(rows.map((r: any) => r.contact_id).filter(Boolean)),
  ) as string[];
  const propertyIds = Array.from(
    new Set(rows.map((r: any) => r.property_id).filter(Boolean)),
  ) as string[];
  const docIds = Array.from(
    new Set(rows.map((r: any) => r.property_document_id).filter(Boolean)),
  ) as string[];

  // Each related-table query is wrapped so a missing table or
  // column on this workspace's schema doesn't blow up the whole
  // response. Contacts is the only table required to exist.
  async function safeIn<T>(
    table: string,
    select: string,
    ids: string[],
  ): Promise<T[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from(table).select(select).in("id", ids);
    if (error) {
      console.warn(`reminders GET: ${table} lookup failed:`, error.message);
      return [];
    }
    return (data || []) as unknown as T[];
  }

  const [relContacts, relProperties, relDocs] = await Promise.all([
    safeIn<{ id: string; name: string }>("contacts", "id, name", contactIds),
    safeIn<{ id: string; address_line1: string | null; city: string | null }>(
      "properties",
      "id, address_line1, city",
      propertyIds,
    ),
    safeIn<{ id: string; title: string; doc_kind: string }>(
      "property_documents",
      "id, title, doc_kind",
      docIds,
    ),
  ]);

  const contactName = new Map<string, string>(
    (relContacts || []).map((c: any) => [c.id, c.name as string]),
  );
  const propLabel = new Map<string, string>(
    (relProperties || []).map((p: any) => [
      p.id,
      [p.address_line1, p.city].filter(Boolean).join(", ") as string,
    ]),
  );
  const docInfo = new Map<string, { title: string; doc_kind: string }>(
    (relDocs || []).map((d: any) => [
      d.id,
      { title: d.title as string, doc_kind: d.doc_kind as string },
    ]),
  );

  const enriched = rows.map((r: any) => ({
    ...r,
    contact_name: r.contact_id ? contactName.get(r.contact_id) || null : null,
    property_address: r.property_id ? propLabel.get(r.property_id) || null : null,
    document_title: r.property_document_id
      ? docInfo.get(r.property_document_id)?.title || null
      : null,
    document_kind: r.property_document_id
      ? docInfo.get(r.property_document_id)?.doc_kind || null
      : null,
  }));

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const body = await request.json();
  const insert: Record<string, unknown> = {
    workspace_id: profile.workspace_id,
    created_by: user.id,
    source: body.source === "auto" ? "auto" : "user",
    contact_id: body.contact_id || null,
    property_id: body.property_id || null,
    appointment_id: body.appointment_id || null,
    channel: "email",
    to_email: body.to_email || null,
    subject: body.subject || null,
    body: body.body || null,
    send_at: body.send_at || null,
    status: "draft",
    reason: body.reason || null,
  };

  const { data, error } = await supabase
    .from("reminders")
    .insert(insert)
    .select()
    .single();
  if (error) {
    console.error("reminders POST:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
