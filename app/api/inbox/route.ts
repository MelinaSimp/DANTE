// app/api/inbox/route.ts — list synced emails with filters + facets.
//
// Returns both the page of items and a small "facets" payload —
// counts per category and per linked property — so the UI can render
// filter chips with live counts without a second query.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
  if (!profile?.workspace_id) {
    return NextResponse.json({ items: [], facets: { categories: [], properties: [] } });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const contactId = searchParams.get("contact_id");
  const propertyId = searchParams.get("property_id");
  const direction = searchParams.get("direction");
  const search = searchParams.get("q")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") || 100), 200);

  const urgency = searchParams.get("urgency");

  let q = supabase
    .from("customer_emails")
    .select(
      "id, contact_id, property_id, direction, from_addr, to_addrs, subject, snippet, received_at, category, category_confidence, urgency_level, urgency_score"
    )
    .eq("workspace_id", profile.workspace_id)
    .limit(limit);

  if (category) q = q.eq("category", category);
  if (contactId) q = q.eq("contact_id", contactId);
  if (propertyId) q = q.eq("property_id", propertyId);
  if (urgency) q = q.eq("urgency_level", urgency);
  if (direction === "inbound" || direction === "outbound") q = q.eq("direction", direction);
  if (search) {
    q = q.or(
      `subject.ilike.%${search}%,snippet.ilike.%${search}%,from_addr.ilike.%${search}%`
    );
  }

  // Sort: urgency first (urgent at top), then most recent. We bucket
  // urgency in SQL via case to keep the order deterministic.
  q = q
    .order("received_at", { ascending: false });

  const { data: items, error } = await q;
  if (error) {
    console.error("inbox GET:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  // Apply urgency-aware sort client-side (simpler than a Postgres CASE
  // and the data is already paged at limit).
  const URGENCY_RANK: Record<string, number> = {
    urgent: 0,
    needs_attention: 1,
    normal: 2,
    low: 3,
  };
  const sorted = (items || []).slice().sort((a: any, b: any) => {
    const ra = URGENCY_RANK[a.urgency_level] ?? 4;
    const rb = URGENCY_RANK[b.urgency_level] ?? 4;
    if (ra !== rb) return ra - rb;
    return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
  });

  // Facets — category counts + urgency counts.
  const { data: facetRows } = await supabase
    .from("customer_emails")
    .select("category, urgency_level")
    .eq("workspace_id", profile.workspace_id);
  const catCounts = new Map<string, number>();
  const urgCounts = new Map<string, number>();
  for (const r of facetRows || []) {
    const c = r.category || "uncategorized";
    catCounts.set(c, (catCounts.get(c) || 0) + 1);
    if (r.urgency_level) {
      urgCounts.set(r.urgency_level, (urgCounts.get(r.urgency_level) || 0) + 1);
    }
  }

  return NextResponse.json({
    items: sorted,
    facets: {
      categories: Array.from(catCounts.entries())
        .map(([k, count]) => ({ key: k, count }))
        .sort((a, b) => b.count - a.count),
      urgency: Array.from(urgCounts.entries())
        .map(([k, count]) => ({ key: k, count }))
        .sort((a, b) => (URGENCY_RANK[a.key] ?? 4) - (URGENCY_RANK[b.key] ?? 4)),
    },
  });
}
