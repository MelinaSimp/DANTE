// SendBlue sender — outbound SMS / iMessage.
//
// Single source of outbound. Splits long messages, retries on
// transient errors, sends typing indicators while the agent runs.
//
// SendBlue is an iMessage gateway: messages to Apple-device numbers
// arrive as blue bubbles, fallback to green-bubble SMS otherwise.
// Their API is HTTP-only — no SDK needed.
//
// Env required:
//   SENDBLUE_API_KEY_ID
//   SENDBLUE_API_SECRET_KEY

import { recordSmsUsage } from "@/lib/usage/track";

const BASE_URL = process.env.SENDBLUE_API_BASE || "https://api.sendblue.co/api";
const MAX_CHUNK = 1500; // SendBlue accepts up to 1600 chars; leave headroom

function getCreds() {
  const id = process.env.SENDBLUE_API_KEY_ID;
  const secret = process.env.SENDBLUE_API_SECRET_KEY;
  if (!id || !secret) {
    throw new Error(
      "SendBlue not configured — set SENDBLUE_API_KEY_ID and SENDBLUE_API_SECRET_KEY in env",
    );
  }
  return { id, secret };
}

function splitMessage(content: string): string[] {
  if (content.length <= MAX_CHUNK) return [content];
  // Prefer to split on sentence/paragraph boundaries.
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > MAX_CHUNK) {
    let cut = remaining.lastIndexOf("\n\n", MAX_CHUNK);
    if (cut < MAX_CHUNK / 2) cut = remaining.lastIndexOf(". ", MAX_CHUNK);
    if (cut < MAX_CHUNK / 2) cut = remaining.lastIndexOf(" ", MAX_CHUNK);
    if (cut < 0) cut = MAX_CHUNK;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function postWithRetry(
  body: Record<string, unknown>,
  attempt = 1,
): Promise<unknown> {
  const { id, secret } = getCreds();
  const r = await fetch(BASE_URL + "/send-message", {
    method: "POST",
    headers: {
      "sb-api-key-id": id,
      "sb-api-secret-key": secret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (r.ok) return r.json();
  if (r.status >= 500 && attempt < 3) {
    await sleep(500 * attempt);
    return postWithRetry(body, attempt + 1);
  }
  const text = await r.text();
  throw new Error(`SendBlue ${r.status}: ${text.slice(0, 200)}`);
}

interface SendOpts {
  workspaceId?: string;
  userId?: string | null;
  /** Best-effort source label for usage tracking. */
  source?: string;
}

export async function sendMessage(
  toPhone: string,
  content: string,
  opts: SendOpts = {},
): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) return;

  const chunks = splitMessage(trimmed);
  for (let i = 0; i < chunks.length; i++) {
    await postWithRetry({
      number: toPhone,
      content: chunks[i],
      send_style: "invisible",
    });
    if (i < chunks.length - 1) await sleep(300);
  }

  // Best-effort usage logging — counts segments for billing.
  if (opts.workspaceId) {
    try {
      recordSmsUsage({
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        messageCount: chunks.length,
        source: opts.source || "sms_assistant",
      });
    } catch {
      // never block send on usage logging
    }
  }
}

export async function sendTypingIndicator(toPhone: string): Promise<void> {
  try {
    const { id, secret } = getCreds();
    await fetch(BASE_URL + "/send-message", {
      method: "POST",
      headers: {
        "sb-api-key-id": id,
        "sb-api-secret-key": secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        number: toPhone,
        send_style: "typing",
      }),
    });
  } catch {
    // Typing is non-essential — never throw.
  }
}

/**
 * Verifies the SendBlue webhook signature header.
 * SendBlue signs requests with HMAC-SHA256 over the raw body.
 */
export function verifySendBlueSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.SENDBLUE_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — dev mode, accept all
    return true;
  }
  if (!signatureHeader) return false;
  const crypto = require("crypto");
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  // Constant-time compare
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(signatureHeader.replace(/^sha256=/, ""), "hex"),
    );
  } catch {
    return false;
  }
}
