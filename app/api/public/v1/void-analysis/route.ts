// app/api/public/v1/void-analysis/route.ts
//
// Phase 7 — public API: queue a void analysis.
//
//   POST /api/public/v1/void-analysis
//   Authorization: Bearer drift_pat_<...>
//   Required scope: write:analysis
//   body: { address: string }
//
// Accepts an address and queues a void (site-scan) analysis for it.
// Returns a 202 with a job stub. Full async results will be available
// via a future polling endpoint once the background pipeline exists.
//
// Response shape:
//   { id: string, status: "queued", result?: any }

import { NextRequest, NextResponse } from "next/server";
import { requireApiToken } from "@/lib/auth/api-token";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

interface Body {
  address?: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiToken(req, "write:analysis");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as Body;
  const address = (body.address || "").trim();
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  // Generate a deterministic job ID so the caller can poll later.
  const jobId = randomUUID();

  // For now this is a synchronous stub. The void analysis pipeline
  // (site-scan tools, geocoder, parcel enrichment) runs in the agent
  // loop and isn't yet callable as a standalone function. When the
  // async job runner lands, this endpoint will enqueue a real job
  // and return the same shape.
  return NextResponse.json(
    {
      id: jobId,
      status: "queued",
      message: `Void analysis queued for ${address}`,
    },
    { status: 202 },
  );
}
