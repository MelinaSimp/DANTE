# Trinity Institutional Readiness Plan

**Goal:** make all three Trinity pillars (Vault, Hermes, Dante) and all 8 build-list
items genuinely institutional-grade — true, polished, and defensible under a
CISO security review, a technical diligence call, and a SOC 2 auditor. No
marketing fiction. Every claim ships with the artifact that proves it.

**Locked decisions (2026-06-18):**

| Fork | Decision |
|---|---|
| Data residency | **Zero-retention private cloud** — ephemeral processing, no raw persistence, single-tenant / BYO-VPC, customer-managed keys |
| Dante model | **Fine-tune a proprietary model** — real training pipeline + eval harness, served in-VPC |
| Market data | **Compliant import + licensed APIs** — bring-your-own-export + official connectors; the cookie/scrape "bypass" is dropped |
| Proof bar | **Audited GA (~1-2 quarters)** — SOC 2 (Type I → Type II window), third-party pen test, line-level provenance, full build |

---

## The institutional gate

A claim is "institutional-level" only when it passes a hostile check. For each
of the 8, the plan defines **the diligence test it must pass** and **the artifact
that proves it**. If we can't produce the artifact, the claim isn't done — it's
just UI.

Three claims today are not merely incomplete, they are *contradicted* by the
code, and those are the ones that sink diligence: local processing (raw PDFs
persist in Supabase, embeddings egress to OpenAI), the "trained model" (it's
Claude + prompts), and the CoStar bypass (doesn't exist; would violate ToS).
The decisions above convert each into something real.

---

## Foundational workstreams (the spine)

Two cross-cutting builds underpin most of the 8. They land first because the
feature work sits on top of them.

### F1 — Zero-retention private cloud

**Why:** makes the Vault + "Minimal-Data Protocol" claim true and is the backbone
of the SOC 2 story.

Current state (from audit):
- `app/api/vault/upload/route.ts` uploads raw bytes to the `agent-files` Supabase
  bucket and keeps them; `app/api/vault/[id]/route.ts` DELETE removes the DB row
  but **not** the stored file.
- `lib/vault/ingest.ts` runs extraction + chunking + embedding **on Vercel**.
- Embeddings go to **OpenAI** (`lib/llm/client.ts`, `lib/dante/archive/embed.ts`,
  `text-embedding-3-small`) — document *content* leaves the perimeter.
- `lib/llm/providers/hermes.ts` is a server-side Ollama stub; the local path was
  scaffolded but never delivered.

Build:
1. **Ephemeral processing sandbox.** Parse/OCR/embed in a worker that holds raw
   bytes only in memory / tmpfs for the duration of the job, then purges. No raw
   bytes touch durable storage by default.
2. **No-raw-retention mode (default for institutional tenants).** Persist only
   structured metadata + vectors + provenance. Make raw retention an explicit,
   per-tenant *opt-in* with auto-expiry, not the default. Fix the DELETE path to
   purge storage objects.
3. **Self-hosted embeddings.** Replace the OpenAI embedding call with an in-VPC
   open embedding model (e.g. BGE-M3 / E5-class) served on the same GPU infra as
   F2. This is what actually lets us say "content never leaves your perimeter" —
   today that sentence is false purely because of the embedding egress. Re-embed
   path + dimension migration on `vector` columns required.
4. **Customer-managed keys (BYOK/CMK).** Envelope encryption; keys the customer
   controls and can revoke (crypto-shred).
5. **Single-tenant / BYO-VPC deployment topology.** Per-tenant isolated Supabase
   project (or self-hosted Postgres) + isolated worker pool. Document the
   topology as a reference architecture.
6. **Data-flow map + subprocessor list + DPA.** Anthropic, Supabase, Vercel,
   Resend, n8n — enumerate every place data flows, with retention terms. For any
   remaining third party that sees content, secure a zero-retention / enterprise
   agreement or remove it.

Diligence test: a CISO traces a document through the system and confirms raw
content is never persisted and never sent to a third party that retains it.
Artifact: security whitepaper + data-flow diagram + retention dashboard showing
purge events.

### F2 — Proprietary fine-tuned model + eval harness

**Why:** makes "Dante, trained deep on real estate" literally true, and is the
single hardest, slowest workstream — it sets the critical path.

Current state: `lib/dante/model-router.ts` routes to `claude-haiku/sonnet/opus`;
`lib/dante/model.ts` default `claude-sonnet-4-6`. No training anywhere. Domain
skill is the `vergil-v3.ts` system prompt + retrieval.

Build:
1. **Corpus.** Assemble a licensing-clean RE training set: lease abstraction
   gold pairs, rent-roll → structured extractions, underwriting Q&A, zoning /
   lease-clause reasoning, void-analysis rationales. Sources: synthetic
   generation from licensed templates, customer-consented (opt-in) de-identified
   data, public filings. **Every record's license is tracked** — a diligence
   requirement.
2. **Strategy: fine-tune the structured/high-volume tasks first.** A tuned
   open-weights model (Llama / Qwen / Mistral class) wins on the well-specified,
   high-volume jobs — lease-field extraction, rent-roll parsing, underwriting
   field population, citation formatting — where determinism + cost + privacy
   matter most. Keep a frontier model (Claude) for open-ended reasoning in
   phase 1; migrate more tasks onto the proprietary model as evals justify it.
3. **Serving in-VPC** (vLLM / TGI on GPU). Co-located with F1 so model inference
   does not break the data-residency claim.
4. **Eval harness** (this is also the *sales* artifact): a held-out RE benchmark
   with task-level accuracy, citation-validity rate, and a hallucination/abstain
   metric. Publish Dante-tuned vs. raw Claude vs. GPT-4-class. This benchmark
   report is what we hand to a skeptic who asks "prove it's specialized."

Diligence test: show the training pipeline, the licensed corpus manifest, the
served model endpoint, and a reproducible benchmark beating base models on RE
tasks. Artifact: model card + benchmark report + corpus license manifest.

> Honest flag: this is the workstream most likely to slip. Corpus licensing and
> eval rigor are the long poles, not the training itself. Budget GPU + a dedicated
> owner. If it slips, the eval-backed "domain reasoning layer" framing is the
> fallback that's still defensible — but the decision is to build the real model.

---

## The 8 claims: current state → institutional target

| # | Claim | Today | Target & diligence test |
|---|---|---|---|
| 1 | Vault parser (OCR + spatial chunking) | Text-PDF only, no OCR, word-count chunking | Real OCR for scans + layout/table-aware chunking; rent rolls/T12s parse cleanly. Test: hand it 10 messy scanned rent rolls, get correct structured JSON. |
| 2 | Minimal-Data Protocol | False — raw PDFs persist, content egresses to OpenAI | F1 delivers it. Test: CISO traces a doc, confirms no raw persistence + no third-party content egress. |
| 3 | Dante RE Lexicon / "won't hallucinate" | Prompt + validator + grounding gate; temp not locked; no "Verify" contract | Formal Verify/abstain output contract, locked per-task temperatures, fine-tuned model, eval proving low hallucination. Test: adversarial missing-data eval set; model abstains, never fabricates. |
| 4 | One-Click Excel Underwriter | DCF engine exists but orphaned; no rent-roll parser; no UI | Rent roll → assumptions → multi-tab model, one click, every cell cited. Test: upload a rent roll, download a model where each number links to its source line. |
| 5 | Hermes Pipeline Monitor | File-watch + auto-ingest real; **no** auto-agents | Event-driven agent cascade on file-drop (underwrite → value-add → draft → flag) with approval gates. Test: drop an OM, watch analysis + draft appear with zero prompts. |
| 6 | CRM Action Dashboard | Drafts polished; alerts narrow; **no** analyses feed | Real "recent analyses" feed (fed by #5) + real property/portfolio alerts. Test: dashboard shows live, data-driven analyses + a real "vacancy/expiry" alert. |
| 7 | Local Client API Bypass | Doesn't exist; CoStar is a scaffolded paid API | Reframed: compliant BYO-export import + licensed connectors. Test: import a real CoStar/county export, parse locally, no ToS breach. |
| 8 | Audit Log + Workflow Engine + page/line provenance | Audit + workflow polished; provenance **page-level only** | Add line/bbox/char-offset capture; every underwriting value cites page **and** line. Test: click any number, highlight exact page + line in the source PDF. |

### Per-item detail

**#1 Parser — OCR + spatial chunking.**
Add a self-hosted OCR stage (Tesseract / PaddleOCR PP-Structure, in-VPC to
preserve F1) for scanned PDFs. Add layout/table extraction so rent rolls, T12s,
and OM tables become structured rows, not flattened text. Extend
`lib/vault/extract.ts` to emit per-token position (page, bbox, line index) — this
single change also powers #8 (line provenance) and #4 (rent-roll parsing). Replace
the word-count chunker in `lib/vault/ingest.ts` with a layout-aware chunker that
respects table/section boundaries.

**#2 Minimal-Data Protocol.** Delivered by F1. No separate work beyond wiring the
per-tenant "no-raw-retention" toggle into the vault UI and the retention dashboard.

**#3 Dante lexicon / anti-hallucination.** Build on what's already strong
(`lib/dante/citation-validator.ts`, `lib/dante/grounding.ts`, the grounding gate
in `app/api/dante/ask/route.ts`). Add: (a) a formal **Verify contract** — a typed
output where any unresolved field returns `{value: null, status: "verify",
reason}` instead of prose, surfaced in the UI as an explicit "needs verification"
chip; (b) **locked per-task temperatures** in the model router (extraction 0.0-0.1,
reasoning 0.2-0.3) so behavior is deterministic and documented, not the current
0.7 chat default; (c) the F2 fine-tuned model trained to abstain; (d) a published
**hallucination/abstain benchmark**.

**#4 One-Click Excel Underwriter.** The hard part is already built and unreachable:
`app/api/export/dcf/route.ts` (IRR via Newton-Raphson, cap rate, multi-tab cash
flows). Wire it up: rent-roll parser (from #1's table extraction) → assumptions
mapping → call the DCF engine → return a downloadable multi-tab workbook. Add the
UI: upload/select a rent roll, edit assumptions, one click to model. Tie every
output cell back to a source cell/line via #8's provenance so the model is
auditable. Reuse `lib/dante/calculators/cre.ts` for the underwriting math.

**#5 Hermes — autonomous pipeline.** Today `app/api/cron/ingest-worker/route.ts`
and the watched-folder path (`electron/watchers.js` →
`app/api/electron/watched-folders/[id]/notify-batch/route.ts`) only ingest. Add an
**orchestration layer**: on successful ingest, classify the document (rent roll /
OM / lease / T12) and enqueue the matching agent cascade — underwrite → value-add
→ draft broker email → flag for review — using the existing n8n engine
(`lib/dante/n8n-bridge.ts`, the `n8n-nodes-drift-cre` nodes) for orchestration and
`DriftApprovalGate` for human-in-the-loop. Results land on the dashboard (#6).
This is what turns "Hermes" from a watched-folder feature into an actual engine.
Rename/define "Hermes Engine" in code so the brand maps to a real module.

**#6 Dashboard — analyses feed + alerts.** Add a `property_analyses` surface fed by
#5's cascade so "recent analyses" is real, not workflow logs. Extend
`lib/dante/noticed/compute.ts` with property/portfolio alert kinds (lease-expiry
clustering, vacancy/occupancy deltas, below-market rent) computed from parsed
rent-roll/lease data — making "Vacancy spike detected in Asset X" a real alert
type. Keep the already-polished approve-and-send drafts.

**#7 Compliant market data.** Drop the bypass. Build robust **export parsers** for
the formats users can legitimately export from CoStar / county portals (CSV/XLSX),
reusing #1's table extraction, via `app/api/workspace/market-files/route.ts`.
Finish the **licensed** CoStar API connector (`lib/integrations/adapters/costar.ts`
is scaffolded) behind the user's own credentials, with the ToS/redistribution
guardrails the adapter already comments on. Position as "bring your own licensed
data," which is exactly what institutions expect.

**#8 Provenance to page + line.** Audit log (`lib/audit/log.ts`, append-only
`audit_events`) and the workflow engine are already institutional-grade — leave
them. Close the provenance gap: #1's parser now emits per-token page + bbox + line.
Add `line_start`, `line_end`, `bbox`, `char_offset` columns to `vault_item_chunks`;
thread them through citations (`lib/dante/citations.ts`) and the validator; render
a "jump to exact page + line, highlighted" view in the source viewer. Now every
underwriting value traces to page **and** line.

---

## Trinity brand → real modules

- **The Vault** = F1 zero-retention ingestion + #1 OCR/spatial parser + #8
  provenance. The "local/private" promise becomes literally true.
- **Hermes Engine** = #5 orchestration layer (currently the brand maps to nothing
  in code). Define it as a real module: the event-driven autonomous agent
  pipeline.
- **Dante Engine** = F2 fine-tuned model + the existing grounding/citation stack +
  #3 Verify contract. "Specialized, trained on real estate" becomes provable.

---

## Compliance & trust layer

(Required by the audited-GA decision; runs in parallel from week 0.)

- **SOC 2 via EasyAudit.** Pursue **Type I** first (point-in-time, achievable
  inside the quarter) to unblock sales, then run the **Type II observation window**
  (3-6 months of evidence) — full Type II realistically lands just past the 2-quarter
  mark. Plan the GA story as "Type I + Type II in progress with bridge letter."
- **Third-party penetration test** + remediation cycle.
- **Controls to formalize:** RBAC, SSO/SAML, the existing append-only audit log
  (already tamper-evident), data-retention controls (from F1), the voice-agent
  vault isolation (already enforced — document it as a control), incident response
  plan, BCP/DR, vendor management.
- **Deliverables:** security whitepaper, architecture + data-flow diagrams,
  subprocessor list, DPA template, model card, BAA path if any healthcare-adjacent
  data appears.

---

## Sequencing (~2 quarters)

**Phase 0 — Foundations (wks 0-2).** Threat model, data-flow map, eval-harness
scaffold, gold-dataset kickoff, GPU/serving infra stood up, EasyAudit + pen-test
vendors engaged. Spec each gap-closure.

**Phase 1 — Spine (wks 2-8).** F1 zero-retention ingestion + self-hosted
embeddings + CMK; #1 OCR + layout-aware parser emitting page/line/bbox; #8
provenance schema + viewer; single-tenant/VPC topology. (One parser workstream
unlocks #1, #4, #8.)

**Phase 2 — Features on the spine (wks 6-14).** #4 one-click underwriter; #5
Hermes cascade + approval gates; #6 analyses feed + property alerts; #7 compliant
import + licensed connector. #3 Verify contract + locked temperatures.

**Phase 3 — Proprietary model (wks 10-20).** F2 corpus → fine-tune → eval → serve
in-VPC → route structured tasks → publish benchmark. (Longest pole; starts early,
runs parallel.)

**Phase 4 — Compliance close + proof kit (wks 16-26).** SOC 2 Type I, pen test +
remediation, Type II window opens, whitepaper + diligence kit + benchmark report +
demos finalized.

---

## The proof kit (what actually "justifies and sells")

The pitch is justified by artifacts, not adjectives. Ship these alongside the
build:

1. **Security whitepaper** + architecture & data-flow diagrams + subprocessor list
   + DPA. (Sells #2, F1.)
2. **SOC 2 report** (Type I + Type II bridge) + pen-test attestation. (Sells the
   institutional bar.)
3. **Model benchmark report** — Dante-tuned vs. Claude vs. GPT-4-class on RE tasks,
   with the held-out set described. (Sells #3, F2, "trained on real estate.")
4. **Provenance demo** — click any number in an underwriting model, the exact PDF
   page + line highlights. (Sells #8.)
5. **Autonomous demo** — drop a rent roll into a watched folder, watch a cited
   underwriting model + a draft broker email appear with no prompts. (Sells #1,
   #4, #5, #6.)
6. **Zero-retention proof** — retention dashboard + purge logs showing raw files
   gone after processing. (Sells #2.)

---

## Risks & honest caveats

- **SOC 2 Type II cannot be fully completed in one quarter** — the observation
  window is months. Lead sales with Type I + a bridge letter; Type II completes
  just past the horizon. Set buyer expectations accordingly.
- **F2 (real fine-tune) is the critical-path risk.** Corpus licensing and eval
  rigor are the long poles. Needs a dedicated owner + GPU budget. The eval-backed
  "domain layer" framing remains the defensible fallback if training slips.
- **Self-hosted embeddings require a re-embed migration** of existing vectors and
  a dimension change on `vector` columns — schedule a maintenance window.
- **Licensed-data position depends on the customer holding the license** (CoStar
  etc.). We provide the pipes; we don't redistribute. Keep the adapter's ToS
  guardrails.
- **Scope is a 1-2 quarter program, not a sprint.** It needs backend, ML, and
  security/compliance owners working in parallel.

---

## Immediate next actions

1. Stand up the eval harness + start the corpus manifest (unblocks F2, the long
   pole).
2. Spike the OCR + layout parser emitting page/line/bbox (unblocks #1/#4/#8).
3. Engage EasyAudit (Type I scoping) + book the pen test.
4. Prototype zero-retention ingestion (ephemeral sandbox + kill raw persistence)
   on a single-tenant test project.
