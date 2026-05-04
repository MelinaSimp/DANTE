// app/api/dante/cron/ingest-federal-register/route.ts
//
// Phase C3 ingest worker — Federal Register.
//
// Why Federal Register instead of per-agency RSS: it's the official
// daily-publication aggregator for every federal agency's rules,
// proposed rules, and notices. The IRS doesn't expose a clean RSS
// (their newsroom is HTML-only, ~85kb of Drupal markup). DOL ERISA
// opinions live behind a similar HTML maze. HUD enforcement same.
// Federal Register has all of them as structured JSON with title,
// abstract, agency mapping, type (Rule/Notice/Proposed Rule), and
// canonical html_url — and the API is documented + free + no key.
//
// One worker, multiple authorities. Each agency we care about gets
// pulled in turn; the agency slug determines the Drift authority
// label so SEC items go in as authority='SEC', IRS as 'IRS', etc.
//
// SEC press releases continue to flow via /ingest-sec-press-releases
// — that feed carries enforcement announcements which often don't
// land in the Federal Register (no rulemaking attached). The two
// sources are complementary: press releases for enforcement news,
// Federal Register for rules + notices + opinions.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { chunkPages } from "@/lib/dante/archive/chunk";
import { embedTexts, toPgVector } from "@/lib/dante/archive/embed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API_BASE = "https://www.federalregister.gov/api/v1/articles";
const PER_AGENCY = 10; // Pull this many recent articles per agency per run.

// Agencies we care about + their Drift authority label + which
// verticals the items default to. Tweak industry_scope below to
// reflect what advisor vs. realtor workspaces actually want surfaced.
const AGENCIES: Array<{
  slug: string;        // Federal Register agency slug
  authority: string;   // → regulatory_corpus_items.authority
  industry_scope: string[];
}> = [
  // Wealth-side: tax + ERISA + securities rulemaking
  { slug: "internal-revenue-service", authority: "IRS", industry_scope: ["financial_advisor"] },
  { slug: "employee-benefits-security-administration", authority: "DOL", industry_scope: ["financial_advisor"] },
  { slug: "securities-and-exchange-commission", authority: "SEC", industry_scope: ["financial_advisor", "real_estate"] },

  // Realtor-side: HUD fair-housing rulemaking
  { slug: "housing-and-urban-development-department", authority: "HUD", industry_scope: ["real_estate"] },
];

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

interface FedRegArticle {
  title: string;
  html_url: string;
  publication_date: string; // YYYY-MM-DD
  abstract: string | null;
  type: string;             // "Rule" | "Notice" | "Proposed Rule" | etc.
}

// Map Federal Register article "type" to our source_kind enum.
// We keep these stable so they're filterable later.
function sourceKindFor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("proposed")) return "proposed_rule";
  if (t.includes("rule")) return "rule";
  if (t.includes("notice")) return "notice";
  if (t.includes("presidential")) return "presidential_doc";
  return "guidance";
}

interface RunSummary {
  agencies: Array<{
    slug: string;
    authority: string;
    fetched: number;
    inserted: number;
    skipped_duplicate: number;
    errors: Array<{ source_url: string; error: string }>;
  }>;
  totals: {
    fetched: number;
    inserted: number;
    skipped_duplicate: number;
  };
}

async function fetchAgency(slug: string): Promise<FedRegArticle[]> {
  const params = new URLSearchParams();
  params.append("conditions[agencies][]", slug);
  params.append("per_page", String(PER_AGENCY));
  params.append("order", "newest");
  for (const f of ["title", "html_url", "publication_date", "abstract", "type"]) {
    params.append("fields[]", f);
  }
  const url = `${API_BASE}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent(),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`${slug}: API ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { results?: FedRegArticle[] };
  return Array.isArray(json.results) ? json.results : [];
}

async function ingestAgency(
  ag: (typeof AGENCIES)[number],
): Promise<RunSummary["agencies"][number]> {
  const out: RunSummary["agencies"][number] = {
    slug: ag.slug,
    authority: ag.authority,
    fetched: 0,
    inserted: 0,
    skipped_duplicate: 0,
    errors: [],
  };

  let articles: FedRegArticle[] = [];
  try {
    articles = await fetchAgency(ag.slug);
  } catch (err) {
    out.errors.push({
      source_url: ag.slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return out;
  }
  out.fetched = articles.length;

  for (const a of articles) {
    try {
      // Dedup by source_url first to skip the embed cost on dups.
      const { data: existing } = await supabaseAdmin
        .from("regulatory_corpus_items")
        .select("id")
        .eq("source_url", a.html_url)
        .maybeSingle();
      if (existing) {
        out.skipped_duplicate += 1;
        continue;
      }

      // Body: prefer abstract; fall back to title if abstract is
      // empty (Notices sometimes have no abstract).
      const body = (a.abstract || a.title || "").trim();
      if (!body) {
        out.errors.push({ source_url: a.html_url, error: "no body or title" });
        continue;
      }

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("regulatory_corpus_items")
        .insert({
          authority: ag.authority,
          source_kind: sourceKindFor(a.type),
          source_url: a.html_url,
          title: a.title,
          body,
          published_at: a.publication_date
            ? new Date(`${a.publication_date}T00:00:00Z`).toISOString()
            : null,
          industry_scope: ag.industry_scope,
        })
        .select("id")
        .single();

      if (insErr || !inserted) {
        if ((insErr as { code?: string })?.code === "23505") {
          out.skipped_duplicate += 1;
          continue;
        }
        throw new Error(insErr?.message || "insert returned no id");
      }
      const itemId = (inserted as { id: string }).id;

      // Chunk + embed + insert. Same pattern as the SEC press
      // releases worker; reuses the existing archive helpers.
      const chunks = chunkPages([{ page: 1, text: body }]);
      if (chunks.length === 0) {
        out.inserted += 1;
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

      out.inserted += 1;
    } catch (err) {
      out.errors.push({
        source_url: a.html_url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return out;
}

async function handle(request: Request) {
  if (!authOk(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary: RunSummary = {
    agencies: [],
    totals: { fetched: 0, inserted: 0, skipped_duplicate: 0 },
  };

  // Sequential per-agency to keep us well under the 60s maxDuration
  // cap and to be polite to the Federal Register API.
  for (const ag of AGENCIES) {
    const result = await ingestAgency(ag);
    summary.agencies.push(result);
    summary.totals.fetched += result.fetched;
    summary.totals.inserted += result.inserted;
    summary.totals.skipped_duplicate += result.skipped_duplicate;
  }

  return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
