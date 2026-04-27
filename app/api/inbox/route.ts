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

  let q = supabase
    .from("customer_emails")
    .select(
      "id, contact_id, property_id, direction, from_addr, to_addrs, subject, snippet, received_at, category, category_confidence"
    )
    .eq("workspace_id", profile.workspace_id)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (category) q = q.eq("category", category);
  if (contactId) q = q.eq("contact_id", contactId);
  if (propertyId) q = q.eq("property_id", propertyId);
  if (direction === "inbound" || direction === "outbound") q = q.eq("direction", direction);
  if (search) {
    q = q.or(
      `subject.ilike.%${search}%,snippet.ilike.%${search}%,from_addr.ilike.%${search}%`
    );
  }

  const { data: items, error } = await q;
  if (error) {
    console.error("inbox GET:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  // Facets — lightweight category counts. We don't need a server-side
  // aggregate at the current scale; counting client-side off the page
  // would miss filtered-out items, so do a tiny separate fetch over
  // category only.
  const { data: catRows } = await supabase
    .from("customer_emails")
    .select("category")
    .eq("workspace_id", profile.workspace_id);
  const catCounts = new Map<string, number>();
  for (const r of catRows || []) {
    const k = r.category || "uncategorized";
    catCounts.set(k, (catCounts.get(k) || 0) + 1);
  }

  return NextResponse.json({
    items: items || [],
    facets: {
      categories: Array.from(catCounts.entries())
        .map(([k, count]) => ({ key: k, count }))
        .sort((a, b) => b.count - a.count),
    },
  });
}
