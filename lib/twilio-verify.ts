import crypto from "crypto";

export function verifyTwilioSignature(opts: {
  authToken: string;
  url: string;              // full URL Twilio hit (https)
  params: Record<string, string | undefined>;
  signature: string | undefined;
}) {
  const { authToken, url, params, signature } = opts;
  if (!signature) return false;

  // Twilio signs url + sorted param values
  const data = url + Object.keys(params).sort().map(k => params[k] ?? "").join("");
  const digest = crypto.createHmac("sha1", authToken).update(data).digest("base64");

  // timing-safe compare
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
