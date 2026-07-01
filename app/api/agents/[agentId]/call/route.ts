// Outbound voice call API — voice retired.
//
// Voice AI was removed from the product on 2026-07-01. This endpoint
// used to place outbound Vapi calls (with DNC/TCPA checks); it now
// returns 410 Gone unconditionally. The full implementation is
// preserved in git history prior to 2026-07-01.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Voice calling has been removed from Drift." },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "Voice calling has been removed from Drift." },
    { status: 410 },
  );
}
