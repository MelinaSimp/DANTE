// lib/integrations/outlook/sync.ts
//
// Pulls Outlook messages via Microsoft Graph and writes them into
// `customer_emails`. Same shape as the Gmail sync — contact-match
// filter, separate distill pass for memory embedding.
//
// Graph differences worth noting vs Gmail:
//   - Messages come back with body already decoded (no base64 dance).
//   - $filter accepts ISO timestamps directly via receivedDateTime.
//   - "to" recipients live under toRecipients; we normalize the
//     shape on the way into customer_emails to match the Gmail rows.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/oauth/microsoft";
import { remember } from "@/lib/dante/memory/write";

const GRAPH_API = "https://graph.microsoft.com/v1.0/me";
const PAGE_SIZE = 50;
const MAX_PAGES_PER_RUN = 5;

interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string | null;
  bodyPreview: string | null;
  receivedDateTime: string;
  body: { contentType: "html" | "text"; content: string } | null;
  from: { emailAddress: { address: string; name?: string } } | null;
  toRecipients: Array<{ emailAddress: { address: string } }>;
  ccRecipients: Array<{ emailAddress: { address: string } }>;
}

export interface SyncResult {
  fetched: number;
  inserted: number;
  matched_to_contacts: number;
}

export async function syncOutlook(input: {
  workspaceId: string;
  userId: string;
  sinceIso?: string;
}): Promise<SyncResult> {
  const accessToken = await getValidAccessToken(input.workspaceId, input.userId);

  const sinceIso =
    input.sinceIso || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Pre-fetch contact emails up front for matching.
  const { data: contactRows } = await supabaseAdmin
    .from("contacts")
    .select("id, email")
    .eq("workspace_id", input.workspaceId);
  const contactByEmail = new Map<string, string>();
  for (const c of (contactRows || []) as Array<{ id: string; email: string | null }>) {
    if (c.email) contactByEmail.set(c.email.toLowerCase(), c.id);
  }

  let next: string | null = null;
  let fetched = 0;
  let inserted = 0;
  let matched = 0;

  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const url: string =
      next ||
      `${GRAPH_API}/messages?$top=${PAGE_SIZE}` +
        `&$filter=receivedDateTime ge ${sinceIso}` +
        `&$select=id,conversationId,subject,bodyPreview,receivedDateTime,body,from,toRecipients,ccRecipients` +
        `&$orderby=receivedDateTime desc`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Graph messages ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { value: GraphMessage[]; "@odata.nextLink"?: string };
    next = json["@odata.nextLink"] || null;

    for (const msg of json.value || []) {
      fetched++;

      const fromAddr = msg.from?.emailAddress.address.toLowerCase() || "";
      const toAddrs = (msg.toRecipients || []).map((r) => r.emailAddress.address.toLowerCase());
      const ccAddrs = (msg.ccRecipients || []).map((r) => r.emailAddress.address.toLowerCase());

      const matchedContactId =
        contactByEmail.get(fromAddr) ||
        toAddrs.map((a) => contactByEmail.get(a)).find(Boolean) ||
        null;
      if (!matchedContactId) continue;
      matched++;

      const direction = contactByEmail.has(fromAddr) ? "inbound" : "outbound";
      const isHtml = msg.body?.contentType === "html";
      const text = isHtml ? null : msg.body?.content || null;
      const html = isHtml ? msg.body?.content || null : null;

      const { error } = await supabaseAdmin.from("customer_emails").upsert(
        {
          workspace_id: input.workspaceId,
          contact_id: matchedContactId,
          direction,
          provider_message_id: msg.id,
          provider_thread_id: msg.conversationId,
          from_addr: fromAddr,
          to_addrs: toAddrs,
          cc_addrs: ccAddrs,
          subject: msg.subject || null,
          snippet: msg.bodyPreview?.slice(0, 160) || null,
          body_text: text,
          body_html: html,
          received_at: msg.receivedDateTime,
        },
        { onConflict: "workspace_id,provider_message_id", ignoreDuplicates: true },
      );
      if (!error) inserted++;
    }

    if (!next) break;
  }

  return { fetched, inserted, matched_to_contacts: matched };
}

// Outlook's distill pass uses the SAME helper as Gmail (rows are
// normalized into customer_emails). Re-export so the route file
// can call it with one import.
export { distillEmailsIntoMemory } from "@/lib/integrations/gmail/sync";

// (intentionally unused but imported to surface the dependency in IDE)
void remember;
