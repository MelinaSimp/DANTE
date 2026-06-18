// app/api/market/comps/import/route.ts
//
// POST a market-comparables export (multipart "file"). Parses it in
// memory and stores structured comps for the workspace. Compliant
// sourcing: the user uploads data they're licensed to use.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseComps } from "@/lib/market/comps-parser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED = /\.(xlsx|xls|csv)$/i;

/** Coerce a free-form date cell to an ISO date string, or null. */
function coerceDate(s: string | null): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data with a 'file' field." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!ACCEPTED.test(file.name)) {
    return NextResponse.json({ error: "Unsupported file. Upload an .xlsx, .xls, or .csv export." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 15 MB)." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseComps(buffer);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, parsed }, { status: 422 });
  }

  const rows = parsed.comps.map((c) => ({
    workspace_id: profile.workspace_id,
    source: file.name,
    address: c.address,
    city: c.city,
    state: c.state,
    property_type: c.propertyType,
    sf: c.sf,
    sale_price: c.salePrice,
    price_per_sf: c.pricePerSf,
    cap_rate: c.capRate,
    sale_date: coerceDate(c.saleDate),
    raw: { source_row: c.sourceRow, sale_date_raw: c.saleDate },
  }));

  let imported = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await supabaseAdmin.from("market_comps").insert(batch);
    if (error) {
      return NextResponse.json(
        { error: `Saved ${imported} of ${rows.length} before failing: ${error.message}` },
        { status: 500 },
      );
    }
    imported += batch.length;
  }

  return NextResponse.json({
    ok: true,
    imported,
    totals: parsed.totals,
    columnMap: parsed.columnMap,
    warnings: parsed.warnings,
  });
}
