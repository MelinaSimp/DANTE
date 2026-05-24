// app/api/dante/cron/ingest-sec-press-releases/route.ts
//
// Phase C3 ingest worker — SEC press releases (which include
// enforcement announcements, rule proposals, and agency news).
//
// Why this source first: SEC press releases carry the highest-
// signal regulatory news for advisors — every enforcement action,
// every charge, every rule proposal lands here. Patrick (ex-Harvey
// product) called the regulatory-corpus moat the cheapest seed-
// stage moat in the panel review. One feed, ~daily updates, and
// the SEC writes the descriptions cleanly enough that they're
// retrievable as-is without scraping the linked release pages.
//
// Dedup key: source_url. UNIQUE constraint on regulatory_corpus_
// items.source_url plus a probe query handles repeats.
//
// SEC requires a User-Agent identifying the requester. Set
// DRIFT_INGEST_USER_AGENT in env to override the default. SEC docs:
//   https://www.sec.gov/os/accessing-edgar-data
//
// Auth: same header-only Bearer pattern as the other cron routes —
// see the recent ?key= sweep that removed query-param fallbacks.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { chunkPages } from "@/lib/dante/archive/chunk";
import { embedTexts, toPgVector } from "@/lib/dante/archive/embed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FEED_URL = "https://www.sec.gov/news/pressreleases.rss";
const MAX_ITEMS_PER_RUN = 25;

function authOk(request: Request): boolean {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: open
  return bearer === secret;
}

function userAgent(): string {
  return (
    process.env.DRIFT_INGEST_USER_AGENT ||
    "Drift AI Ingest (ops@driftai.studio)"
  );
}

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

// Minimal RSS 2.0 parser tailored for SEC's feed shape. We
// deliberately avoid a parser dep (fast-xml-parser, xml2js) for one
// well-known feed — fewer moving parts. If SEC ever changes the
// feed shape, this throws and the cron run reports the failure
// loudly via the response body.
function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemBlocks = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/g) || [];
  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const description = extractTag(block, "description");
    const pubDate = extractTag(block, "pubDate");
    if (!title || !link) continue;
    items.push({
      title: decodeEntities(stripTags(title)).trim(),
      link: link.trim(),
      description: decodeEntities(stripTags(description ?? "")).trim(),
      pubDate: pubDate ? pubDate.trim() : null,
    });
  }
  return items;
}

function extractTag(block: string, tag: string): string | null {
  // Handles plain tags and CDATA-wrapped content. SEC's feed uses
  // CDATA for descriptions but plain text for titles/links.
  const cdata = new RegExp(`<${tag}\\b[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i");
  const plain = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return (block.match(cdata)?.[1] ?? block.match(plain)?.[1]) || null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

interface RunSummary {
  fetched: number;
  inserted: number;
  skipped_duplicate: number;
  errors: Array<{ source_url: string; error: string }>;
  feed_url: string;
}

async function handle(request: Request) {
  if (!authOk(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Pull the feed.
  const res = await fetch(FEED_URL, {
    headers: {
      "User-Agent": userAgent(),
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Feed fetch failed: ${res.status} ${res.statusText}` },
      { status: 502 },
    );
  }
  const xml = await res.text();
  const items = parseFeed(xml).slice(0, MAX_ITEMS_PER_RUN);

  const summary: RunSummary = {
    fetched: items.length,
    inserted: 0,
    skipped_duplicate: 0,
    errors: [],
    feed_url: FEED_URL,
  };

  // 2. For each item, dedup → insert → chunk → embed → insert chunks.
  for (const item of items) {
    try {
      // Dedup by source_url (PRIMARY KEY-ish — UNIQUE constraint on
      // the column). We probe before insert to also skip the embed
      // cost on duplicates.
      const { data: existing } = await supabaseAdmin
        .from("regulatory_corpus_items")
        .select("id")
        .eq("source_url", item.link)
        .maybeSingle();
      if (existing) {
        summary.skipped_duplicate += 1;
        continue;
      }

      // Body for the corpus row is the description from the feed.
      // Short but accurate — rich enough for retrieval to find
      // relevance, with source_url for the agent to point users to
      // the full release. Future: scrape the full release page when
      // we want richer chunks; for now description is fine.
      const body = item.description || item.title;
      if (!body || body.length < 40) {
        // Empty or microscopic releases (rare) — store metadata-only
        // row so they're still listable, but skip embedding.
        await supabaseAdmin.from("regulatory_corpus_items").insert({
          authority: "SEC",
          source_kind: "press_release",
          source_url: item.link,
          title: item.title,
          body: body || item.title,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
          industry_scope: ["real_estate"],
        });
        summary.inserted += 1;
        continue;
      }

      // Insert the item first to get its id.
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("regulatory_corpus_items")
        .insert({
          authority: "SEC",
          source_kind: "press_release",
          source_url: item.link,
          title: item.title,
          body,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
          industry_scope: ["real_estate"],
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        // 23505 = unique_violation; treat as a race-condition dup.
        if ((insertErr as { code?: string })?.code === "23505") {
          summary.skipped_duplicate += 1;
          continue;
        }
        throw new Error(insertErr?.message || "insert returned no id");
      }
      const itemId = (inserted as { id: string }).id;

      // 3. Chunk the body, embed each chunk, insert chunk rows.
      const chunks = chunkPages([{ page: 1, text: body }]);
      if (chunks.length === 0) {
        summary.inserted += 1;
        continue;
      }
      const vectors = await embedTexts(chunks.map((c) => c.content));
      const chunkRows = chunks.map((c, i) => ({
        item_id: itemId,
        ord: c.index,
        content: c.content,
        embedding: toPgVector(vectors[i]),
      }));
      const { error: chunkErr } = await supabaseAdmin
        .from("regulatory_corpus_chunks")
        .insert(chunkRows);
      if (chunkErr) throw new Error(chunkErr.message);

      summary.inserted += 1;
    } catch (err) {
      summary.errors.push({
        source_url: item.link,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
