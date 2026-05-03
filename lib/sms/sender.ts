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
  /** Override the workspace's default sender. Used by workflow's
   *  send_sms node to honor an explicit `from_number` config. */
  fromNumber?: string;
}

export interface SendResult {
  /** What SendBlue actually delivered. iMessage when the recipient is
   *  on Apple, "sms" when SendBlue had to fall back to green-bubble.
   *  Audit-relevant — the workflow runner stores this so we know what
   *  channel a reminder fired through. */
  delivery_channel: "imessage" | "sms" | "unknown";
  /** SendBlue's message_handle (or the first chunk's, if the body
   *  was split). NULL if the response shape didn't include one — we
   *  don't fail the send for missing telemetry. */
  message_id: string | null;
  /** Number of chunks delivered. >1 when the body exceeded MAX_CHUNK. */
  segments: number;
}

interface SendBlueResponse {
  message_handle?: string;
  was_downgraded?: boolean;
  status?: string;
}

export async function sendMessage(
  toPhone: string,
  content: string,
  opts: SendOpts = {},
): Promise<SendResult> {
  const trimmed = content.trim();
  if (!trimmed) {
    return { delivery_channel: "unknown", message_id: null, segments: 0 };
  }

  const fromNumber =
    opts.fromNumber || process.env.SENDBLUE_FROM_NUMBER || undefined;

  const chunks = splitMessage(trimmed);
  let firstHandle: string | null = null;
  let downgraded = false;
  for (let i = 0; i < chunks.length; i++) {
    const body: Record<string, unknown> = {
      number: toPhone,
      content: chunks[i],
      send_style: "invisible",
    };
    if (fromNumber) body.from_number = fromNumber;
    const raw = (await postWithRetry(body)) as SendBlueResponse;
    if (i === 0 && typeof raw?.message_handle === "string") {
      firstHandle = raw.message_handle;
    }
    // SendBlue marks `was_downgraded: true` when an iMessage attempt
    // fell back to green-bubble SMS. Track at the message level: if
    // ANY chunk fell back, we report "sms" (the user's experience is
    // "I got a green bubble"), not a per-chunk channel.
    if (raw?.was_downgraded) downgraded = true;
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

  return {
    delivery_channel: downgraded ? "sms" : "imessage",
    message_id: firstHandle,
    segments: chunks.length,
  };
}

export async function sendTypingIndicator(toPhone: string): Promise<void> {
  try {
    const { id, secret } = getCreds();
    const fromNumber = process.env.SENDBLUE_FROM_NUMBER || undefined;
    const body: Record<string, unknown> = {
      number: toPhone,
      send_style: "typing",
    };
    if (fromNumber) body.from_number = fromNumber;
    await fetch(BASE_URL + "/send-message", {
      method: "POST",
      headers: {
        "sb-api-key-id": id,
        "sb-api-secret-key": secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Typing is non-essential — never throw.
  }
}

/**
 * Verifies a SendBlue webhook request.
 * SendBlue forwards the configured shared secret as-is in the
 * `sb-signing-secret` header (per the SendBlue dashboard).
 */
export function verifySendBlueSignature(
  _rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.SENDBLUE_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — dev mode, accept all
    return true;
  }
  if (!signatureHeader) return false;
  const crypto = require("crypto");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
