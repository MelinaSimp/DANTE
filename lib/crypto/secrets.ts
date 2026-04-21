// Envelope encryption for secrets we store at rest in Postgres.
//
// Today the only caller is Twilio auth tokens (twilio_credentials.auth_token),
// but this is the shared helper — API keys for other integrations should
// go through here too.
//
// Format (single string column, no schema change needed):
//
//   enc:v1:<iv-base64>:<ciphertext-base64>:<authtag-base64>
//
// The leading `enc:v1:` tag lets us detect encrypted vs. plaintext values
// in-place. That's important because:
//   • we rolled this out after the column was already populated with
//     plaintext tokens, so reads have to handle both shapes;
//   • if we ever need to rotate the key format (v2), we can tell old
//     values apart from new ones at decrypt time.
//
// Key management:
//   DRIFT_SECRET_KEY must be a base64-encoded 32-byte random key.
//   Generate with: openssl rand -base64 32
//   Set in Vercel → Environment Variables for Production + Preview.
//
// AES-256-GCM is the right primitive here: authenticated, no padding
// oracle, NIST-approved, and crypto.createCipheriv in Node's stdlib
// avoids pulling in any third-party crypto.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";
const IV_BYTES = 12; // GCM standard nonce length
const KEY_BYTES = 32; // 256-bit key

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.DRIFT_SECRET_KEY;
  if (!raw) {
    throw new Error(
      "DRIFT_SECRET_KEY is not set. Generate one with `openssl rand -base64 32` and add to environment.",
    );
  }
  // Accept either base64 or hex. Base64 is canonical; hex is a
  // convenience for `openssl rand -hex 32` users.
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
    buf = Buffer.from(raw.trim(), "hex");
  } else {
    buf = Buffer.from(raw.trim(), "base64");
  }
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `DRIFT_SECRET_KEY must decode to ${KEY_BYTES} bytes (got ${buf.length}). Regenerate with \`openssl rand -base64 32\`.`,
    );
  }
  cachedKey = buf;
  return buf;
}

/** True if the value looks like one of our encrypted blobs. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypt a plaintext secret. Returns `enc:v1:iv:ct:tag`.
 * Throws if the key isn't configured — callers should surface this
 * as a 500 rather than silently storing plaintext.
 */
export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptSecret: plaintext must be a non-empty string");
  }
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

/**
 * Decrypt a value. Accepts both encrypted blobs (returned as plaintext)
 * and legacy plaintext values (returned as-is) so the rollout is
 * seamless — migrate-on-read handles the tail of unencrypted rows.
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!isEncrypted(value)) {
    // Legacy plaintext — return untouched. Caller should schedule a
    // lazy re-encrypt.
    return value;
  }
  const body = value.slice(PREFIX.length);
  const parts = body.split(":");
  if (parts.length !== 3) {
    throw new Error("decryptSecret: malformed ciphertext");
  }
  const [ivB64, ctB64, tagB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Best-effort lazy re-encryption: if a caller just decrypted a
 * plaintext-legacy value, they can fire-and-forget this to upgrade
 * the row without blocking the request path. The argument shape keeps
 * this generic — pass in whatever UPDATE call makes sense for your
 * table.
 */
export async function reencryptInBackground(
  reason: string,
  upgrade: () => Promise<unknown>,
): Promise<void> {
  try {
    await upgrade();
  } catch (err) {
    // Don't throw — this is an opportunistic upgrade, the live request
    // already succeeded with the plaintext value.
    console.warn(`[secrets] lazy re-encrypt failed (${reason}):`, err);
  }
}
