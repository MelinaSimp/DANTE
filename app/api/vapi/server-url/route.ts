// VAPI Server URL Webhook — voice retired.
//
// Voice AI was removed from the product on 2026-07-01. This endpoint
// used to serve Vapi tool-calls (scheduling, voicemail), end-of-call
// reports (summaries, compliance scans, usage tracking), and status
// updates for live voice agents. It now acknowledges any webhook with
// an empty 200 (Vapi retries on non-2xx — there is nothing to retry
// into) and logs the event so stray traffic is visible.
//
// Any assistants still deployed in the Vapi dashboard should be
// deleted there; their tool calls will no-op against this endpoint.
// The full implementation (1,650 lines) is preserved in git history
// prior to 2026-07-01.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  // Keep the optional shared-secret check so the retired endpoint
  // doesn't become an unauthenticated log-spam target.
  const vapiSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (vapiSecret) {
    const headerSecret =
      req.headers.get("x-vapi-secret") ||
      req.headers.get("authorization")?.replace("Bearer ", "");
    if (headerSecret !== vapiSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let messageType = "unknown";
  try {
    const body = await req.json();
    messageType = body?.message?.type ?? "unknown";
  } catch {
    // Non-JSON payload — nothing to parse.
  }
  console.warn(
    `[VAPI] Webhook received (type=${messageType}) but voice AI is retired — acknowledging with no-op`,
  );
  return NextResponse.json({}, { status: 200 });
}
