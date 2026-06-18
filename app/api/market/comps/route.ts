// app/api/market/comps/route.ts
//
// GET    -> list the workspace's imported comps + aggregates
// DELETE -> clear all comps for the workspace (re-import flow)

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface CompRow {
  id: string;
  source: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  property_type: string | null;
  sf: number | null;
  sale_price: number | null;
  price_per_sf: number | null;
  cap_rate: number | null;
  sale_date: string | null;
  created_at: string;
}

async function workspaceFor(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.workspace_id ?? null;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function GET() {
  const ws = await workspaceFor();
  if (!ws) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("market_comps")
    .select("id, source, address, city, state, property_type, sf, sale_price, price_per_sf, cap_rate, sale_date, created_at")
    .eq("workspace_id", ws)
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<CompRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const comps = data || [];
  const ppsfs = comps.map((c) => c.price_per_sf).filter((n): n is number => typeof n === "number" && n > 0);
  const caps = comps.map((c) => c.cap_rate).filter((n): n is number => typeof n === "number" && n > 0);
  const prices = comps.map((c) => c.sale_price).filter((n): n is number => typeof n === "number" && n > 0);

  const avgPpsf = avg(ppsfs);
  const avgCap = avg(caps);
  const avgPrice = avg(prices);

  return NextResponse.json({
    comps,
    totals: {
      count: comps.length,
      avgPricePerSf: avgPpsf == null ? null : Math.round(avgPpsf * 100) / 100,
      avgCapRate: avgCap == null ? null : Math.round(avgCap * 10000) / 10000,
      avgSalePrice: avgPrice == null ? null : Math.round(avgPrice),
    },
  });
}

export async function DELETE() {
  const ws = await workspaceFor();
  if (!ws) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabaseAdmin.from("market_comps").delete().eq("workspace_id", ws);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
