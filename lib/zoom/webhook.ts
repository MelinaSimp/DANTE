// Zoom webhook signature verification.
//
// Zoom signs each webhook with HMAC-SHA256 over the string
//   v0:<x-zm-request-timestamp>:<raw body>
// using the workspace's webhook_secret (from the Zoom app's Feature tab).
// The expected header value is `v0=<hex>`.
//
// We also need to answer the url_validation challenge at setup time —
// Zoom POSTs event=endpoint.url_validation with a plainToken and expects
// encryptedToken = HMAC-SHA256(plainToken, webhook_secret) back.
//
// Docs: https://developers.zoom.us/docs/api/webhooks/#validate-your-webhook-endpoint

import { createHmac, timingSafeEqual } from "crypto";

export function verifyZoomSignature(
  webhookSecret: string,
  timestamp: string,
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader || !timestamp) return false;
  const message = `v0:${timestamp}:${rawBody}`;
  const expected =
    "v0=" + createHmac("sha256", webhookSecret).update(message).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Response for Zoom's endpoint.url_validation challenge. */
export function computeUrlValidationResponse(
  webhookSecret: string,
  plainToken: string
): { plainToken: string; encryptedToken: string } {
  const encryptedToken = createHmac("sha256", webhookSecret)
    .update(plainToken)
    .digest("hex");
  return { plainToken, encryptedToken };
}
