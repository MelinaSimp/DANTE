import twilio from "twilio";
import { NextRequest } from "next/server";

/**
 * Validate that a webhook request actually came from Twilio.
 * Returns true if valid (or if validation is disabled / auth token missing).
 */
export async function validateTwilioRequest(req: NextRequest): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_MASTER_AUTH_TOKEN;
  if (!authToken) {
    console.warn("[Twilio Validate] No TWILIO_AUTH_TOKEN set — skipping signature validation");
    return true;
  }

  const signature = req.headers.get("x-twilio-signature") || "";
  if (!signature) return false;

  const url = buildTwilioUrl(req);
  const params = await extractParams(req);

  return twilio.validateRequest(authToken, signature, url, params);
}

function buildTwilioUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;
}

async function extractParams(req: NextRequest): Promise<Record<string, string>> {
  if (req.method === "GET") {
    const params: Record<string, string> = {};
    req.nextUrl.searchParams.forEach((v, k) => { params[k] = v; });
    return params;
  }

  try {
    const cloned = req.clone();
    const formData = await cloned.formData();
    const params: Record<string, string> = {};
    formData.forEach((v, k) => { params[k] = String(v); });
    return params;
  } catch {
    return {};
  }
}
