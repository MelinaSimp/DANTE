// lib/oauth/crypto.ts
//
// AES-256-GCM at-rest encryption for OAuth tokens. Keyed by
// OAUTH_ENCRYPTION_KEY (hex-encoded 32 bytes; we accept base64 too
// for ops convenience). Ciphertext format:
//
//   enc:<base64(iv||ciphertext||authtag)>
//
// The "enc:" prefix lets us detect plaintext rows from before this
// upgrade — getValidAccessToken transparently migrates them on the
// next refresh. If OAUTH_ENCRYPTION_KEY isn't set we no-op (return
// the input unchanged) so dev environments don't break, but we log
// loud warnings on every encrypt/decrypt path so production
// misconfiguration is impossible to miss.

import crypto from "node:crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 12;            // GCM standard
const TAG_LEN = 16;
const PREFIX = "enc:";

let warned = false;
function getKey(): Buffer | null {
  const raw = process.env.OAUTH_ENCRYPTION_KEY;
  if (!raw) {
    if (!warned) {
      console.warn(
        "[oauth.crypto] OAUTH_ENCRYPTION_KEY not set — OAuth tokens stored in plaintext. Set a 32-byte key (hex or base64) before production rollout.",
      );
      warned = true;
    }
    return null;
  }
  // Accept either hex or base64. Hex string for 32 bytes is 64 chars.
  let buf: Buffer;
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === 64) {
    buf = Buffer.from(raw, "hex");
  } else {
    buf = Buffer.from(raw, "base64");
  }
  if (buf.length !== 32) {
    throw new Error(`OAUTH_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length})`);
  }
  return buf;
}

export function encrypt(plain: string): string {
  if (!plain) return plain;
  const key = getKey();
  if (!key) return plain;
  if (plain.startsWith(PREFIX)) return plain;        // already encrypted

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, enc, tag]).toString("base64");
}

export function decrypt(maybeEncrypted: string): string {
  if (!maybeEncrypted) return maybeEncrypted;
  if (!maybeEncrypted.startsWith(PREFIX)) {
    // Plaintext (legacy row from before encryption was wired up).
    // Return as-is; getValidAccessToken will re-encrypt on the
    // next persist cycle.
    return maybeEncrypted;
  }
  const key = getKey();
  if (!key) {
    throw new Error(
      "[oauth.crypto] Encrypted token found but OAUTH_ENCRYPTION_KEY is not set. " +
        "Set the key or re-OAuth all users.",
    );
  }
  const buf = Buffer.from(maybeEncrypted.slice(PREFIX.length), "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("[oauth.crypto] ciphertext too short");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const enc = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(enc), decipher.final()]);
  return out.toString("utf8");
}

/** True when the value is already in our enc:<...> format. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}
