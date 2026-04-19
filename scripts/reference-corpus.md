# Reference corpus — what we ingest and why

The AI cites these sources when it gives tax, regulatory, or compliance
guidance. Every citation resolves to a specific chunk of one of these
documents, with a stable hash so "the model said this on April 19" is
reproducible even if the upstream page is later updated.

This is the RIA-side analogue to Harvey's "named legal integrations."

## Target set (10 documents for v1)

| source_key                 | Authority | Document                                           | Why it matters                                         |
|---------------------------|-----------|----------------------------------------------------|--------------------------------------------------------|
| irs-pub-590a-2025         | IRS       | Publication 590-A (Contributions to IRAs)         | Contribution limits, deductibility, rollovers         |
| irs-pub-590b-2025         | IRS       | Publication 590-B (Distributions from IRAs)       | RMDs, QCDs, inherited IRAs, penalty exceptions        |
| irs-pub-575-2025          | IRS       | Publication 575 (Pension and Annuity Income)      | Qualified plan distributions, NUA, early-withdrawal   |
| irs-pub-550-2025          | IRS       | Publication 550 (Investment Income and Expenses)  | Cost basis, wash sales, qualified dividends           |
| irs-rev-proc-contribution-limits-2025 | IRS | 2025 contribution limit tables                    | 401(k), IRA, HSA, SEP limits                           |
| ssa-cola-2025             | SSA       | 2025 Cost-of-Living Adjustment                    | SS benefit increase, earnings test, max taxable       |
| cms-irmaa-2025            | CMS       | 2025 Medicare IRMAA brackets                      | Medicare surcharge tiers                               |
| finra-2210                | FINRA     | Rule 2210 — Communications with the Public       | Marketing / client-comms compliance                   |
| sec-reg-bi                | SEC       | Regulation Best Interest                          | Fiduciary standard for broker-dealers                 |
| sec-adv-part-2a           | SEC       | Form ADV Part 2A instructions                     | RIA disclosure brochure rules                         |

## How to ingest

Run the script for each source (examples below). The script downloads
the document, hashes the bytes, extracts text, chunks into ~800-char
passages with overlap, embeds with `text-embedding-3-small`, and writes
to `reference_sources` + `reference_chunks`.

```bash
# IRS Pub 590-B (the RMD bible)
npx tsx scripts/ingest-reference-doc.ts \
  --source-key irs-pub-590b-2025 \
  --title "IRS Publication 590-B — Distributions from IRAs (2025)" \
  --authority IRS \
  --url https://www.irs.gov/pub/irs-pdf/p590b.pdf \
  --year 2025

# IRS Pub 590-A
npx tsx scripts/ingest-reference-doc.ts \
  --source-key irs-pub-590a-2025 \
  --title "IRS Publication 590-A — Contributions to IRAs (2025)" \
  --authority IRS \
  --url https://www.irs.gov/pub/irs-pdf/p590a.pdf \
  --year 2025

# FINRA Rule 2210
npx tsx scripts/ingest-reference-doc.ts \
  --source-key finra-2210 \
  --title "FINRA Rule 2210 — Communications with the Public" \
  --authority FINRA \
  --url https://www.finra.org/rules-guidance/rulebooks/finra-rules/2210
```

## Dry-run

Skip the DB write and embedding call while you verify extraction works:

```bash
npx tsx scripts/ingest-reference-doc.ts \
  --source-key irs-pub-590b-2025 \
  --title "IRS Publication 590-B" \
  --authority IRS \
  --url https://www.irs.gov/pub/irs-pdf/p590b.pdf \
  --dry-run
```

## Re-ingest policy

The script is idempotent — re-running with the same `--source-key`
upserts the `reference_sources` row and replaces all chunks for the
current embedding model. If the upstream document has changed, the new
`content_hash` will differ from the stored one; the script doesn't
block on this yet, but the verification layer can compare and flag it.

When we switch embedding models, rows with the old `embedding_model`
stay in place — so existing citations still resolve. New embeddings
get inserted side-by-side.
