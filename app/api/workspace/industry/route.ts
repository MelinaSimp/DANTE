// app/api/workspace/industry/route.ts
//
// CRE-only. Always returns real_estate.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ industry: "real_estate" });
}
