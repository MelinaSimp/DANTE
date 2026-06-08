// app/api/site-scan/geocode/route.ts
//
// POST /api/site-scan/geocode
//
// Geocode a property address to lat/lng coordinates. Called by the
// DriftDueDiligence n8n node as the first step of a due diligence
// workflow. Also available from the Drift UI.
//
// Supports two auth modes:
//   1. Cookie-based session (Drift UI)
//   2. Service role key in headers (n8n nodes)

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/site-scan/enrichment/geocoder";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Validate the caller is authorized via either session cookie or
 * Supabase service role key (sent by n8n custom nodes).
 */
async function authorize(req: NextRequest): Promise<boolean> {
  // Check for n8n service-role auth first (apikey header)
  const apiKey = req.headers.get("apikey");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (apiKey && serviceRoleKey && apiKey === serviceRoleKey) {
    return true;
  }

  // Fall back to cookie-based session auth
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const address = typeof body.address === "string" ? body.address.trim() : "";

  if (!address) {
    return NextResponse.json(
      { error: "address is required" },
      { status: 400 },
    );
  }

  try {
    const result = await geocodeAddress(address);
    if (!result) {
      return NextResponse.json(
        { error: "Could not geocode address", address },
        { status: 422 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Geocoding failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
