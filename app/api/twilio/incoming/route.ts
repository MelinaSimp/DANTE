// Twilio Incoming Call Webhook — voice retired.
//
// Voice AI was removed from the product on 2026-07-01 (too unstable to
// sell). Any number still pointing its "A CALL COMES IN" webhook here
// gets a polite message and a hangup instead of the old receptionist
// pipeline. SMS is unaffected — it runs through /api/twilio/sms.
//
// The full receptionist implementation is preserved in git history
// (see this file prior to 2026-07-01) if voice ever comes back.

import { NextRequest, NextResponse } from "next/server";
import { validateTwilioRequest } from "@/lib/twilio-validate";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const RETIRED_TWIML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This number does not take voice calls. Please reach the office by text message or email.</Say>
  <Hangup/>
</Response>`;

async function handleIncoming(req: NextRequest): Promise<NextResponse> {
  if (!(await validateTwilioRequest(req))) {
    console.warn("[Twilio Incoming] Invalid signature — rejecting request");
    return new NextResponse("Forbidden", { status: 403 });
  }

  console.warn(
    "[Twilio Incoming] Voice call received but voice AI is retired — returning reject TwiML",
  );
  return new NextResponse(RETIRED_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  return handleIncoming(req);
}

export async function GET(req: NextRequest) {
  return handleIncoming(req);
}
