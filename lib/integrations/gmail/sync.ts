// lib/integrations/gmail/sync.ts
//
// Pulls Gmail messages for a connected advisor and writes them into
// `customer_emails`. Two-step: list message ids since the last
// successful sync, then fetch each message body and persist.
//
// Why we don't store everything: scope creep. We only want messages
// to/from people who are already contacts in this workspace. The
// advisor's mom emailing about Thanksgiving is none of our business.
// We filter by intersecting from/to addresses with contacts.email
// after fetching headers.
//
// Embedding into dante_memory happens in a separate pass — see
// distillEmailsIntoMemory() at the bottom — so a slow OpenAI call
// can't gum up the Gmail rate-limit budget.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/oauth/google";
import { remember } from "@/lib/dante/memory/write";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const PAGE_SIZE = 100;
const MAX_PAGES_PER_RUN = 5; // ~500 messages/run; tune later

interface GmailMessageMeta {
  id: string;
  threadId: string;
}

interface GmailMessageFull {
  id: string;
  threadId: string;
  internalDate: string;            // ms unix as string
  snippet?: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    parts?: Array<unknown>;
    body?: { data?: string };
    mimeType?: string;
  };
}

function header(msg: GmailMessageFull, name: string): string | null {
  const h = msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
}

function parseAddrList(raw: string | null): string[] {
  if (!raw) return [];
  // RFC 5322 is a beast; for our purposes a regex over angle-bracketed
  // emails plus a fallback split is plenty. We're not building a
  // mail client, just normalizing for dedupe + contact match.
  const matches = raw.match(/<([^>]+)>/g);
  if (matches) return matches.map((m) => m.slice(1, -1).toLowerCase());
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Decode a base64url Gmail body part. */
function decodeBody(data: string | undefined): string {
  if (!data) return "";
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

/** Pull the first text/plain part out of a possibly multipart payload. */
function extractText(payload: GmailMessageFull["payload"]): { text: string; html: string } {
  let text = "";
  let html = "";
  const visit = (p: { mimeType?: string; body?: { data?: string }; parts?: Array<unknown> }) => {
    if (p.mimeType === "text/plain" && p.body?.data && !text) {
      text = decodeBody(p.body.data);
    } else if (p.mimeType === "text/html" && p.body?.data && !html) {
      html = decodeBody(p.body.data);
    }
    if (Array.isArray(p.parts)) for (const sub of p.parts as typeof p[]) visit(sub);
  };
  visit(payload);
  return { text, html };
}

interface SyncInput {
  workspaceId: string;
  userId: string;
  /** ISO timestamp; messages internalDate >= sinceIso are considered. */
  sinceIso?: string;
}

export interface SyncResult {
  fetched: number;
  inserted: number;
  matched_to_contacts: number;
}

export async function syncGmail(input: SyncInput): Promise<SyncResult> {
  const accessToken = await getValidAccessToken(input.workspaceId, input.userId);

  // Build a Gmail query. `after:` accepts a unix-second timestamp.
  // Default lookback: 30 days, so first-time sync stays bounded.
  const since = input.sinceIso
    ? Math.floor(new Date(input.sinceIso).getTime() / 1000)
    : Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const q = `after:${since}`;

  // Fetch contact emails up front — we'll match against this set after
  // pulling each message. One round-trip beats N joins.
  const { data: contactRows } = await supabaseAdmin
    .from("contacts")
    .select("id, email")
    .eq("workspace_id", input.workspaceId);
  const contactByEmail = new Map<string, string>();
  for (const c of (contactRows || []) as Array<{ id: string; email: string | null }>) {
    if (c.email) contactByEmail.set(c.email.toLowerCase(), c.id);
  }

  let pageToken: string | undefined;
  let fetched = 0;
  let inserted = 0;
  let matched = 0;

  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const listUrl = new URL(`${GMAIL_API}/messages`);
    listUrl.searchParams.set("q", q);
    listUrl.searchParams.set("maxResults", String(PAGE_SIZE));
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}: ${(await listRes.text()).slice(0, 200)}`);
    const listJson = (await listRes.json()) as {
      messages?: GmailMessageMeta[];
      nextPageToken?: string;
    };
    const ids = (listJson.messages || []).map((m) => m.id);
    pageToken = listJson.nextPageToken;

    for (const id of ids) {
      // Skip if already stored. Gmail message ids are stable, so the
      // unique (workspace_id, provider_message_id) constraint would
      // catch dupes — but checking up front avoids the body fetch.
      const { data: existing } = await supabaseAdmin
        .from("customer_emails")
        .select("id")
        .eq("workspace_id", input.workspaceId)
        .eq("provider_message_id", id)
        .maybeSingle();
      if (existing) continue;

      const fetchRes = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!fetchRes.ok) continue;
      const msg = (await fetchRes.json()) as GmailMessageFull;
      fetched++;

      const fromAddr = (parseAddrList(header(msg, "From"))[0] || "").toLowerCase();
      const toAddrs = parseAddrList(header(msg, "To")).map((a) => a.toLowerCase());
      const ccAddrs = parseAddrList(header(msg, "Cc")).map((a) => a.toLowerCase());
      const subject = header(msg, "Subject") || "";
      const dateMs = Number(msg.internalDate) || Date.now();

      // Direction: outbound if any to/cc address is the advisor (i.e.
      // it's not in contactByEmail and matches the user's own email).
      // Simpler heuristic: inbound if from is a known contact.
      const direction = contactByEmail.has(fromAddr) ? "inbound" : "outbound";
      const matchedContactId =
        contactByEmail.get(fromAddr) ||
        toAddrs.map((a) => contactByEmail.get(a)).find(Boolean) ||
        null;

      // Skip messages with no contact match — Phase 1's "no scope creep"
      // promise. The advisor's personal mail stays out of the store.
      if (!matchedContactId) continue;
      matched++;

      const { text, html } = extractText(msg.payload);

      const { error } = await supabaseAdmin.from("customer_emails").insert({
        workspace_id: input.workspaceId,
        contact_id: matchedContactId,
        direction,
        provider_message_id: id,
        provider_thread_id: msg.threadId,
        from_addr: fromAddr,
        to_addrs: toAddrs,
        cc_addrs: ccAddrs,
        subject,
        snippet: msg.snippet?.slice(0, 160) || null,
        body_text: text || null,
        body_html: html || null,
        received_at: new Date(dateMs).toISOString(),
      });
      if (!error) inserted++;
    }

    if (!pageToken) break;
  }

  return { fetched, inserted, matched_to_contacts: matched };
}

/**
 * Distill unprocessed customer_emails into dante_memory episodes.
 * Runs as a separate pass so a slow embedding API can't block the
 * Gmail polling loop. Idempotent: marks rows `embedded_into_memory`.
 */
export async function distillEmailsIntoMemory(workspaceId: string, batchSize = 25): Promise<number> {
  const { data: rows } = await supabaseAdmin
    .from("customer_emails")
    .select("id, contact_id, direction, subject, body_text, snippet, received_at")
    .eq("workspace_id", workspaceId)
    .eq("embedded_into_memory", false)
    .order("received_at", { ascending: true })
    .limit(batchSize);

  let processed = 0;
  for (const r of (rows || []) as Array<{
    id: string;
    contact_id: string | null;
    direction: string;
    subject: string | null;
    body_text: string | null;
    snippet: string | null;
    received_at: string;
  }>) {
    const body = (r.body_text || r.snippet || "").trim();
    if (!body) {
      // Mark as processed anyway so we don't keep re-trying empty rows.
      await supabaseAdmin
        .from("customer_emails")
        .update({ embedded_into_memory: true })
        .eq("id", r.id);
      continue;
    }

    const content = [
      `Email (${r.direction}) — ${r.subject || "(no subject)"} — ${r.received_at}`,
      "",
      body.slice(0, 4000), // cap to keep embedding cost predictable
    ].join("\n");

    try {
      await remember({
        workspaceId,
        kind: "episode",
        content,
        subjectContactId: r.contact_id ?? undefined,
        sourceKind: "email",
        sourceId: r.id,
      });
      await supabaseAdmin
        .from("customer_emails")
        .update({ embedded_into_memory: true })
        .eq("id", r.id);
      processed++;
    } catch (err) {
      console.error("[gmail.distill] failed for", r.id, err);
      // Leave embedded_into_memory=false so the next run retries.
    }
  }
  return processed;
}
