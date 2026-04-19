# Depth-over-breadth plan

One workflow, grounded, with citations. Everything else is decoration
until this works.

## The bet

Drift's current moat is zero. We have Next.js UI wrapping Claude. A CCO at
a real RIA would reject this in 90 seconds because nothing we output can
be traced to a source.

**What we're going to fix, and only this:** make meeting prep + recap
genuinely grounded. Every claim in the output cites an exact transcript
timestamp or source document chunk. A CCO can hover any bullet and see
the sentence it came from.

That's the smallest credible "our AI doesn't hallucinate" story we can
ship. Everything in the 10-item Harvey critique is true. We're ignoring 9
of them until we nail this one.

## The one workflow

Meeting Prep + Recap.

Why this one:
- 40% already built (recorder → Whisper → summary → note).
- The transcript is by definition extractive — we can't hallucinate what
  was literally said.
- It's the thing advisors do every day. High frequency = fast feedback.
- Compliance value is obvious: "here's the transcript that produced this
  summary" is a story a CCO can take to the SEC.

## Where we are — April 2026 update

Milestone 1 shipped. The recorder → Whisper → summary → note chain now
requires every summary claim to cite a transcript segment ID; unsupported
claims are dropped at the verification pass and a "Verified X/Y" badge
shows the grounded ratio. CallAuditView renders summary-left / transcript-
right with hover-to-highlight.

Two things have changed since the original plan:

1. **We're investing in the moat-around-the-moat earlier.** The original
   plan deferred custodian integration, primary-source ingestion, and
   structured client-doc extraction until after a paying design partner.
   After the Harvey review, it's clear those three are the only things
   that make Milestone 4's score credible to a CCO. Without them, a
   grounded summary is just "the LLM didn't lie about what was said" —
   true but insufficient. With them, the grounded summary can be cross-
   checked against positions, balances, 1099s, and authoritative rules.
   That's the story a CCO actually wants.

2. **The UI got Harvey-ified.** Not polish — alignment of visual
   language with what compliance officers and senior advisors recognize
   as "serious tool." Pure white canvas, editorial serif headers, 1px
   rules, mono for data. The redesign is design-tokens-deep, not a
   skin, so every page we migrate inherits it.

## Milestones, revised

### Milestone 1 — One grounded summary ✅ Apr 2026
- Whisper verbose segments stored on call_recordings.
- Structured summary prompt with per-claim cite_segments.
- CallAuditView with hover-to-verify (Harvey-ized Apr 19).
- Verified X/Y badge on every grounded summary.

### Milestone 1.5 — The moat-around-the-moat (in progress, Apr 2026)
Scaffold shipped; production usage behind.

- **Eval harness for call summaries** — scoring against the four failure
  conditions from Luca's repo (unsupported claim, wrong citation,
  missing required fact, prohibited claim). 1 sample case today,
  target 10 before we cite a number, 100 before we call the summary
  pipeline production-ready.
- **Reference library** — `reference_sources` + `reference_chunks`
  tables, ingest script, 10-doc target corpus (IRS Pub 590-A/B, 575,
  550, SSA COLA, CMS IRMAA, FINRA 2210, SEC Reg BI, Form ADV Part 2A,
  2025 contribution limits). Embeddings stored as jsonb today;
  pgvector migration when traffic justifies.
- **Compliance scanner** — deterministic rules (FINRA 2210 guarantees,
  Reg BI blanket recs, unqualified tax advice, RMD statements) + LLM
  layer for fuzzier issues + `compliance_flags` with pending/approved/
  dismissed workflow. Sticky dismissals so false-positive-once stays
  suppressed. Wired into the dashboard's "awaiting review" count.
- **Custodian layer** — driver interface + mock Schwab driver (three
  seeded households, realistic positions) + sync API that writes
  `custodian_balances` + `custodian_positions` per day. Real Schwab /
  Fidelity / Altruist drivers slot in without touching downstream.
- **Client-doc extraction** — per-doc schemas (1099-B complete,
  1099-DIV / 1099-R headers done, W-2 / K-1 / 5498 pending),
  extraction pipeline that calls Claude/GPT-4o-mini and stores
  structured fields + rows + per-field confidence in
  `document_extractions`.

Ship when: each scaffold has at least one end-to-end real use. For the
compliance scanner, that means auto-running on call-summary save and
showing flags inline. For the custodian layer, that means the dashboard
shows real household AUM pulled from `custodian_balances`. For the
reference library, that means the call-summary prompt retrieves
relevant chunks and includes them as context when the transcript hints
at a regulatory question (e.g. RMD calculation).

### Milestone 2 — Pre-meeting brief (unchanged)
From a calendar item with a linked contact, generate a one-page brief
with sections (Context / Open items / Talking points / Risks). Every
section cites which past note, annotation, document chunk, custodian
position, or reference doc it came from.

Now that the custodian layer and reference library exist, the brief
can include quantitative sections: "Current 60/40 drift: +3.1% equity
over band" or "RMD required by Dec 31: approx $25,000 per Pub 590-B
Uniform Lifetime Table."

### Milestone 3 — Verification + audit packet (unchanged)
Post-processing verification pass + audit packet PDF/ZIP for a call or
brief.

### Milestone 4 — Eval harness + published score
Two eval tracks now:
- Call-summary eval (harness shipped Apr 2026; need 100 cases).
- Pre-meeting brief eval (needs harness scaffold + 40 cases).

Ship when: we have ≥100 call-summary cases and ≥40 brief cases,
CFP-graded, and can publish an honest pass rate per failure condition
on the landing page.

### Milestone 5 — One design partner (unchanged)
One real small RIA using the workflow weekly.

### Milestone 6 — The yes-or-no (unchanged)
First design partner either pays or tells us why not.

## What this plan explicitly refuses to do (revised)

- No SEC EDGAR ingestion beyond the 10-doc reference corpus until M5
  demands it.
- No Cohere reranker. The retrieval layer uses jsonb cosine until
  traffic justifies pgvector; we'll measure before swapping.
- No 1,000-case eval. 100 for call-summary, 40 for brief is enough
  through M5.
- No SOC 2, no SSO, no SCIM. Zero enterprise prospects today.
- No landing-page rewrite until M4 gives us a real number.
- No new custodian drivers (Fidelity, Altruist) until the Schwab driver
  is real. The mock driver is scaffold — replace it with Schwab before
  we add more.

## What "done" looks like at M5

- One grounded workflow (meeting prep + recap) that a CCO would accept.
- Published accuracy score against ≥100 call-summary cases.
- Audit packet a compliance officer can sign off on.
- Call summaries auto-scanned for FINRA / Reg BI issues, flags gated
  before send.
- Primary-source citations on every regulatory claim the AI makes.
- Custodian data backing every quantitative claim in briefs.
- Structured tax-doc data available for cross-check against custodian
  cost basis.
- One design partner using it weekly.
- Everything else in the product exists but is gated behind Labs so
  new users see the sharp core, not the shallow periphery.

At M5, we earn the right to build IPS drafting, tax-loss harvesting, or
whatever the design partner says hurts most. Not before.

## Non-goals (unchanged)

- Investor decks.
- Team hiring beyond a CFP co-author.
- Fundraising before M5.

## Failure modes to watch (revised)

1. **Scope creep mid-milestone.** Still the biggest risk.
2. **Filling time.** If a milestone takes less time than estimated,
   ship and move on.
3. **Polishing UI.** The Harvey redesign is done. Further UI work
   before M5 is procrastination.
4. **Chasing the 10 Harvey items.** That list describes a 2-year $100M
   company. Stop.
5. **Over-building the moat layers.** Each of the five M1.5 scaffolds
   is *scaffold*. It's tempting to keep hardening them before using
   them. Don't. Wire them into the user-facing flow as soon as they're
   minimally usable, even if rough.
6. **Pretending the mock driver is a custodian.** It's fixtures. Any
   user-facing copy that reads balances must say "Demo data" until a
   real driver is wired.

## One-line test

If a compliance officer asks *"where did this answer come from?"* — can
we show them? If yes, we're on plan. If no, nothing else matters.
