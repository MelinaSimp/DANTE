# Drift -- Master Execution Plan

**Synthesized from three Council of 20 sessions (May 10-12, 2026)**
**Status:** 1 paying customer, ~3 prospects, partner closing CRE companies at $1,000/month
**Last updated:** 2026-06-07

### Completion Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 | COMPLETE | All critical fixes shipped |
| Phase 1 | COMPLETE | Lease abstractor: 3-pass pipeline, template persistence, CSV/XLSX/PDF export, disclaimers |
| Phase 2 | COMPLETE | All 3 CRE voice scenarios configured |
| Phase 3 | ~90% | Watched folder: consent mode, recency-first, batch embedding all done. Post-hoc review UI deferred |
| Phase 4 | ~90% | Deal agent: pipeline view, LOI, PSA redline, broker email all done |
| Phase 5 | ~75% | 256 tests across 11 files. Lease abstractor, skills, grounding, citations, fair housing, CRE calc all covered |
| Phase 6 | KILLED | RIA vertical removed 2026-05-24; CRE-only |
| Phase 7 | DEFERRED | Integrations demand-gated |
| n8n Migration | COMPLETE | 3 phases done, custom nodes deployed to Railway, legacy engine stripped |

---

## Strategic Position (What the Council Established)

### What Drift Is Now

Drift is a **lease abstraction and deal intelligence platform for commercial real estate brokers and developers**, with a parallel track toward RIA/wealth management (gated by SOC 2).

The existing infrastructure — citation-grounded document intelligence, Vapi voice AI with Twilio/ElevenLabs, workflow automation, hybrid memory system, vault with watched folders — was built for fiduciary professionals but maps almost perfectly to commercial RE.

### What Changed

| Session | Key Revelation | Strategic Impact |
|---------|---------------|------------------|
| Session 1 | Product is overbuilt for stage; distribution is the bottleneck | Stop building features, start selling |
| Session 2 | Two real bugs in grounding/citation; <5% test coverage; infra on free tiers | 30-day finish sprint before scaling |
| Session 3 | Partner closing CRE companies at $1K/mo; Vapi already integrated; RIAs blocked by SOC 2 | Vergil/CRE is the revenue engine; Dante/RIA is the long-term play |

### The Two-Track Strategy

**Track 1 — Commercial Real Estate (Vergil): Revenue engine. Ship now.**
- Lease Abstractor (net-new feature, #1 closer)
- Voice AI scenarios (configure existing Vapi infrastructure)
- Deal Agent (polish existing Vergil capabilities)
- Target: brokers and developers at $1,000-2,000/month per firm

**Track 2 — RIA/Wealth Management (Dante): Long-term play. Build credibility.**
- SOC 2 Type I (start immediately, 3-month process)
- Small-firm RIA outreach (2-3 person shops that don't require SOC 2)
- Infrastructure upgrades (paid tiers eliminate procurement objections)
- Target: independent RIAs at $150-250/seat/month once SOC 2 is in hand

---

## Phase 0: Critical Fixes (Week 1)

These bugs and gaps affect BOTH verticals. Fix before anything else.

### 0.1 — Add `regulatory.search` to RETRIEVAL_TOOLS
- **File:** `lib/dante/grounding.ts` line 28-39
- **Change:** Add `"regulatory.search"` and `"regulatory_search"` to the `RETRIEVAL_TOOLS` Set
- **Also:** Update grounding summary (lines ~145-160) to include `regulatoryCount` in the badge text
- **Why:** Responses grounded in SEC/IRS/HUD citations currently score as "general knowledge"
- **Effort:** 15 minutes

### 0.2 — Implement Regulatory Citation Validation
- **File:** `lib/dante/citation-validator.ts`
- **Changes:**
  1. Extend `extractMarkers()` regex (line ~110) to match `[reg:\d+]`
  2. Add `fetchRegulatoryContext()` — query `regulatory_corpus_items` + `regulatory_corpus_chunks` by ID
  3. Add `checkRegulatoryMarker()` — resolve item from trace, confirm existence, verify quote via `quoteAppearsIn()`
  4. Wire into `validateCitations()` (line ~316) alongside vault and memory checks
- **Why:** Regulatory citations are rendered in UI but never validated. Liability risk for a product selling regulatory accuracy.
- **Effort:** 4-6 hours

### 0.3 — Convert Chat Deletion to Soft Delete
- **File:** `app/api/dante/chats/[id]/route.ts` lines 40-65
- **Changes:**
  1. New migration: add `deleted_at timestamptz` to `dante_chats`; partial index on active chats
  2. Replace `.delete().eq("id", id)` (line 62) with `.update({ deleted_at: new Date().toISOString() })`
  3. Add `logAuditEvent({ action: "chat.delete", ... })` after soft delete
  4. Filter soft-deleted chats from list endpoints: `.is("deleted_at", null)`
  5. Keep all `dante_chat_messages` intact (traces, citation reports, grounding scores preserved for compliance)
- **Why:** Hard delete destroys audit trails. Compliance violation for a product used in regulated industries.
- **Effort:** 2 hours

### 0.4 — Fix `validator_pass_rate` Default
- **File:** `lib/dante/grounding.ts` line 110
- **Change:** When `citationCount === 0 && retrieval_tools_called > 0`, set `validator_pass_rate = 0` instead of 1. The existing zero-check on line 128 already handles the no-tools-no-citations case.
- **Why:** Current default inflates grounding scores for "searched but didn't cite" responses.
- **Effort:** 30 minutes

### 0.5 — Upgrade Infrastructure
| Item | Cost | What It Fixes |
|------|------|---------------|
| Vercel Pro | $20/mo | 300s function timeout (from 60s). Complex lease abstractions won't truncate. |
| Supabase Pro | $25/mo | 8GB database (from 500MB). Supports ~50+ firms' vault embeddings. |
| Apple Developer | $99/yr | Proper code signing. Eliminates Gatekeeper warnings on macOS Electron app. |
| **Total** | **$640/yr** | |

### 0.6 — Voice Agent Vault Isolation
- **File:** `app/api/vapi/server-url/route.ts` (the 1,368-line webhook handler)
- **Change:** In the `tool-calls` event handler, check whether the call is external (caller/recipient number not in workspace). If external, reject `vault.cite` and `archive.search` tool calls with `{ error: "Document access is not available during external calls." }`
- **Why:** Confidential lease terms, deal structures, and financial data must never be disclosed to external parties via voice. This is a fiduciary and contractual liability.
- **Effort:** 2-3 hours

---

## Phase 1: Lease Abstractor (Weeks 1-3) — THE #1 PRIORITY

This is the feature that closes deals. The partner identified it as the top seller. Firms do ~8 leases/month, each taking 4-10 hours manually. Drift does it in minutes.

### 1.1 — Extraction Pipeline
- **Multi-pass architecture:**
  - Pass 1: Identify lease structure — TOC, section boundaries, exhibit list. Use chunked vault content + Claude to produce a structural map.
  - Pass 2: Targeted field extraction — for each of 30-40 standard fields, identify the relevant section(s) from Pass 1, extract the value with a citation to page + clause.
  - Pass 3: Cross-reference validation — verify internal consistency (e.g., rent escalation schedule matches base rent; commencement date + term = expiration date). Reuse `inconsistency.detect` pattern.
- **Citation contract:** Every extracted field carries a `[v<N>]` citation marker linking to the exact page and clause. The existing citation validator verifies these post-extraction.
- **Implementation:** New module `lib/dante/lease-abstractor.ts`. Reuses `ingestVaultItem()` for chunking, `vault.cite` for retrieval, `computeGroundingScore()` for quality scoring.

### 1.2 — Structured Output Schema
Default CRE lease abstraction template (30-40 fields):

**Deal Terms:**
- Tenant name / Landlord name / Guarantor(s)
- Premises description (address, suite, floor, SF)
- Lease type (NNN, gross, modified gross)
- Commencement date / Expiration date / Term (months)
- Renewal options (count, term, notice period, rent basis)
- Expansion options / Right of first refusal / Right of first offer
- Termination options (early termination, conditions, penalties)

**Financial Terms:**
- Base rent schedule (year-by-year with escalations)
- Escalation type (fixed %, CPI, fair market)
- CAM / operating expense obligations
- Real estate tax obligations
- Insurance obligations
- Percentage rent (threshold, rate, breakpoint)
- Security deposit (amount, form, conditions for return)
- Tenant improvement allowance (amount, disbursement, conditions)
- Free rent / abatement periods

**Key Clauses:**
- Co-tenancy provisions (required co-tenants, remedies if violated)
- Exclusive use provisions
- Go-dark provisions (can tenant cease operations?)
- Assignment and subletting rights
- SNDA (Subordination, Non-Disturbance, Attornment)
- Estoppel certificate requirements
- Holdover provisions
- Default and cure periods
- Force majeure

**Context Analysis (AI-generated, not extracted):**
- Tenant-favorable vs. landlord-favorable assessment
- Anchor tenant leverage analysis ("this building is next to a Giant Eagle — co-tenancy clause gives you leverage")
- Comparable market positioning
- Key risks and unusual clauses

### 1.3 — Per-Workspace Template Customization
- Store in `dante_skills` table (existing, with versioning)
- Firms start with default template
- Can add/remove/reorder fields
- Can add firm-specific clause categories
- Corrections during review train the template: if broker adds a field the system missed, that field gets priority in future extractions
- **Why training matters:** Every CRE firm has different priorities. Retail lease specialists care about co-tenancy. Office specialists care about TI. The system must learn each firm's focus.

### 1.4 — Purpose-Built UI (NOT the chat interface)
- **Upload screen:** Large drop zone. "Drop your lease here." Progress animation during extraction.
- **Abstract view:** Two-panel layout.
  - Left panel: Structured table — field name, extracted value, confidence indicator, citation link
  - Right panel: SourceViewer showing lease PDF with cited clause highlighted
  - Click any field → SourceViewer jumps to the cited page
  - Edit any field → saves correction as training signal
- **Export:** Excel (.xlsx), CSV, clipboard. Brokers live in spreadsheets.
- **Disclaimer:** "AI-generated abstract. Review by qualified professional recommended." On every output.
- Reuses existing SourceViewer component with PDF quote highlighting (already built).

### 1.5 — File Size and Processing
- Bump max file size to 200MB for lease abstractor (commercial leases with exhibits can be 50-100MB+)
- Multi-pass extraction handles 200+ page documents without hitting context window limits
- Estimated LLM cost: $3-5 per lease (3-5 API calls × ~100K tokens). 80 leases/month = $240-400/month against $10K/month revenue = 89%+ gross margin.

---

## Phase 2: CRE Voice Scenarios (Week 2-3, parallel with lease abstractor)

The Vapi + Twilio + ElevenLabs voice infrastructure already exists. This phase is CONFIGURATION, not code.

### 2.1 — Inbound Listing Qualification Scenario
- **Trigger:** Incoming call to firm's listing line
- **Flow:** Identify caller → Determine property of interest → Qualify (timeline, budget, entity type, use case) → Schedule showing or route to broker
- **Tools available:** `memory.search` (contact history), `clients.query` (CRM lookup), calendar/scheduling
- **Tools blocked:** `vault.cite`, `archive.search` (external caller — vault isolation rule)
- **Implementation:** Scenario graph in `lib/vapi/scenario-prompt.ts` format → `syncAgentToVapi()`

### 2.2 — Outbound Owner Prospecting Scenario
- **Trigger:** Broker initiates campaign or scheduled workflow
- **Flow:** Introduce firm → Pitch market expertise → Ask about portfolio/disposition plans → Handle objections → Book meeting
- **Tools available:** `memory.search`, `clients.query`
- **Tools blocked:** `vault.cite`, `archive.search`
- **Compliance:** TCPA compliance — do-not-call list checking before outbound dial. Add DNC check to `createOutboundCall()` flow.

### 2.3 — Lease Expiration Notification Scenario
- **Trigger:** Workflow cron fires N months before extracted lease expiration date
- **Flow:** Identify tenant contact → Notify of approaching renewal deadline → Offer to schedule meeting with broker → Confirm or leave message
- **Data source:** Expiration date stored on contact/deal record by lease abstractor (not vault — no confidential terms disclosed)
- **Tools available:** `memory.search`, `clients.query`, scheduling
- **Tools blocked:** `vault.cite`, `archive.search`

### 2.4 — Expiration-to-Call Workflow
- Lease abstractor extracts expiration date → stores on deal/contact record
- New workflow template: trigger = cron (daily), condition = contact has lease expiring within N months, action = initiate outbound Vapi call using notification scenario
- Uses existing workflow engine (`lib/dante/workflow-runner.ts`) + existing Vapi `createOutboundCall()`
- This connects two existing systems — no new infrastructure needed.

---

## Phase 3: Watched Folder Scaling (Week 3-4)

Unblock 400GB+ customers. Currently every file requires manual confirmation.

### 3.1 — Folder-Level Consent Mode
- **Migration:** Add to `watched_folders`:
  - `confirm_mode text NOT NULL DEFAULT 'per_file' CHECK (confirm_mode IN ('per_file', 'folder_consent'))`
  - `consent_granted_at timestamptz`
  - `consent_granted_by uuid REFERENCES auth.users(id)`
- **Registration UI:** Two options when watching a folder:
  - "Review files individually" → `per_file` (current behavior preserved)
  - "Index all files automatically" → `folder_consent` (new fast path)
- **Consent dialog for `folder_consent`:**
  - Local-only: "All supported files in [folder] will be indexed locally. Files never leave this device."
  - Cloud: "File contents will be sent to Drift's servers for processing."
  - Both: "You can remove any file from the index at any time."
  - Log: `watched_folder.folder_consent_granted` audit event
- **Notify route change** (`app/api/electron/watched-folders/[id]/notify/route.ts` line ~133):
  - `folder_consent` → auto-confirm regardless of processing mode
  - Existing cloud auto-confirm path unchanged
  - `per_file` behavior unchanged

### 3.2 — Recency-First Processing
- Sort files by `mtime` descending before feeding into ingestion queue
- Newest files (current deals, active leases) indexed first
- Advisor/broker gets value in minutes; historical files process in background
- Progress UI: "Indexing [folder]: 847 of 12,341 files. You can start asking questions now."

### 3.3 — Extraction Throughput
- Increase worker concurrency from 2 to 4 for `folder_consent` mode in Electron main process
- Batch embedding: accumulate chunks across files, send 2,000 chunks per API call (vs. current per-item). ~20x fewer API round-trips.

### 3.4 — Post-Hoc Review (Phase 2 — after core ships)
- "Recently Indexed" feed: reverse-chronological list of auto-confirmed files
- One-click "Remove from index" per file (soft-delete vault_item, audit log removal)
- Exclusion rules (glob patterns) for CCO/admin control

---

## Phase 4: Deal Agent Polish (Weeks 4-6)

Enhance existing Vergil capabilities for CRE deal workflow.

### 4.1 — LOI / PSA Templates
- CRE-specific document templates as Vergil skills
- LOI draft: takes property address, buyer entity, price, terms from conversation context → fills template
- PSA redline analysis: upload PSA, get structured markup of non-standard clauses with risk assessment
- Tour follow-up drafts from CRM + memory context

### 4.2 — Pipeline View
- Deals by stage (prospecting → LOI → under contract → due diligence → closing)
- Next-action recommendations per deal
- Comparison view: "I'm at [property], what do I know about it?" — pulls from memory + vault + contacts

### 4.3 — Broker Email Drafts
- Draft from CRM context: Vergil knows the deal, the contact, the history
- Cite relevant deal terms in internal communications
- Queue for review before sending (existing supervisor review queue)

---

## Phase 5: Test Infrastructure (Ongoing, parallel)

### 5.1 — Configure Vitest
- Install vitest, create `vitest.config.ts`, add `test` script to package.json
- Migrate 2 existing test files (`citation-validator.test.ts`, `fair-housing-scanner.test.ts`)
- Effort: 2 hours

### 5.2 — Critical Path Test Suites
| Suite | File | Tests | Priority |
|-------|------|-------|----------|
| Citation validator | `lib/dante/citation-validator.test.ts` | Vault match/mismatch/missing, memory hit/miss, regulatory hit/miss, edge cases | HIGH — expand from 4 to ~20 tests |
| Grounding score | `lib/dante/grounding.test.ts` (new) | Zero tools, strong/partial/general tiers, regulatory inclusion, edge cases | HIGH |
| Tool budget | `lib/dante/agent-budget.test.ts` (new) | Budget caps enforced, graceful degradation, per-tool limits | MEDIUM |
| Fair housing scanner | `lib/compliance/fair-housing-scanner.test.ts` | 20 adversarial listing descriptions with varying risk levels | HIGH — must pass before selling on fair housing value prop |
| Lease abstractor | `lib/dante/lease-abstractor.test.ts` (new) | Field extraction accuracy, citation correctness, cross-reference validation | HIGH — after Phase 1 ships |

### 5.3 — Instrumentation
- **Tool-level telemetry:** New `dante_tool_invocations` table. Instrument `dispatchTool()` in `lib/dante/agent.ts` lines 1315-1346. Track tool_name, success, duration_ms, workspace_id.
- **Citation click tracking:** Lightweight `POST /api/dante/telemetry` endpoint. Fire on citation chip click and grounding badge expand.
- **Grounding score distribution:** Query against existing `dante_chat_messages.grounding_score`. Expose via `/api/dante/analytics/grounding-distribution`.
- **Lease abstractor metrics:** Fields extracted, corrections made, time-to-abstract, per-firm template evolution.

---

## Phase 6: RIA Track (Parallel, Months 2-6)

### 6.1 — SOC 2 Type I
- Start with EasyAudit (already set up)
- Budget: ~$5K
- Timeline: 3 months from kickoff
- Fund from CRE revenue (5 firms at $1K/month covers it in Month 1)

### 6.2 — Small-Firm RIA Outreach
- Target: solo and 2-3 person RIAs without formal procurement processes
- Pre-load prospect ADV Part 2 from SEC IAPD database before demo
- Demo script: upload their ADV, ask a question, show cited answer with page number
- Don't wait for SOC 2 — small firms don't require it

### 6.3 — Re-Engage RIA Prospects
- Call back every RIA that said no
- Ask: "If we had SOC 2 today, would you sign?" — diagnose whether SOC 2 is the real objection or a polite no
- For those truly blocked by SOC 2: "We're 3 months from Type I completion. Can we schedule a follow-up?"

### 6.4 — UX Segmentation (When RIA pipeline is active)
- Advisor view: clean answers, simple trust signal (green/amber/red icon), "Save to client file" button
- CCO view: full citation chips, grounding scores, trace viewer, audit export
- Gate on `isWorkspaceAdmin(profile.role)` from existing RBAC (`lib/rbac.ts`)

---

## Phase 7: Integrations (Weeks 11+, only if customers demand)

### 7.1 — Google Docs / Sheets API
- Export lease abstracts directly to Google Sheets
- Export deal memos to Google Docs
- Only build when 3+ firms explicitly request it

### 7.2 — Outlook / Gmail Integration
- Inbox watching via Microsoft Graph or Gmail API
- Pipeline automation: watch inbox → detect deal-related emails → update CRM → draft follow-ups
- Substantial build (3-4 weeks). Defer until retention data confirms demand.

### 7.3 — Word Add-In
- Embed Vergil in Word for PSA/LOI editing
- Low priority — "Copy to clipboard" covers 90% of the use case

---

## Revenue Model

### Commercial Real Estate Pricing
| Tier | Price | Includes |
|------|-------|----------|
| Broker | $1,000/mo | Lease Abstractor + Deal Agent + Voice AI (inbound/outbound) for up to 5 users |
| Brokerage | $2,000/mo | Everything above for up to 15 users + priority support |
| Enterprise | Custom | Unlimited users + custom integrations + dedicated onboarding |

Test $2,000/month on next prospect. Current $1,000 is likely underpriced given $54-120K/year labor savings and CoStar/Argus pricing benchmarks ($300-1,500/user/month).

### RIA Pricing (When SOC 2 is ready)
| Tier | Price | Includes |
|------|-------|----------|
| Advisor seat | $150/mo | Dante chat + vault + memory + workflows |
| Compliance seat | $350/mo | Everything above + grounding analytics + audit export + review queue |

### Unit Economics
- LLM cost per lease abstraction: $3-5 (multi-pass, ~100K tokens)
- 80 leases/month (10 firms × 8 leases) = $240-400/month LLM cost
- Against $10,000/month revenue = 89%+ gross margin
- Infrastructure: ~$100/month (Vercel Pro + Supabase Pro + Vapi + Twilio)

---

## Timeline and Milestones

| Week | Deliverable | Revenue Impact |
|------|-------------|---------------|
| **Week 1** | Critical bug fixes + infrastructure upgrades + vault isolation | Unblocks all selling |
| **Week 2** | Lease abstractor extraction pipeline + CRE voice scenarios | — |
| **Week 3** | Lease abstractor UI + export + watched folder scaling | Partner can demo to prospects |
| **Week 4** | Lease expiration workflow + Deal Agent LOI templates | Full product bundle sellable |
| **Month 2** | Partner closes 5 firms | $5,000/month ($60K ARR) |
| **Month 2** | SOC 2 Type I kickoff | — |
| **Month 3** | Test $2K/month pricing + fair housing tests + vitest suite | Potential $10-20K/month |
| **Month 4** | 10 firms paying + pipeline view + broker email drafts | $10-20K/month ($120-240K ARR) |
| **Month 5** | SOC 2 Type I complete (best case) | RIA sales unblocked |
| **Month 6** | 20 firms CRE + first RIA customers | $20-40K/month ($240-480K ARR) |

---

## Go-to-Market (Partner-Led)

### CRE Sales Motion
1. Map connections — parents, friends, former colleagues who touch commercial RE (developers, brokers, property managers, attorneys, lenders)
2. Warm intro: "Can I show you something for 5 minutes? If you know anyone who spends hours abstracting leases, I'll save them 40 hours a month."
3. Demo: Drop their lease → structured abstract in 3 minutes → show citations to exact clauses
4. Trial: "Use it on your next lease. Free. If it saves you time, $1,000/month."
5. Close: No contract, cancel anytime.

### CRE Conference/Association Play
- Local Board of Realtors / CCIM (Certified Commercial Investment Member) chapter meetings — weekly/biweekly, free to attend
- Demo the lease abstractor live with audience members' documents
- Commercial RE is geographically clustered — seed one city, go deep

### The Pitch (One Sentence)
**"Drop your lease. Get a cited abstract in 3 minutes instead of 6 hours. $1,000/month."**

### Content Plan
- Month 1: Case study with first CRE customer. 300 words, one metric.
- Month 2: "Your AI Notetaker Records the Meeting. Can It Cite the Lease Clause?" — thought leadership positioning document intelligence vs. meeting intelligence.
- Month 3: 2-minute demo video. Upload lease, show abstract, show citation. No production budget needed.

---

## Legal / Compliance Checklist

- [ ] DPA (Data Processing Agreement) template — $500 from a lawyer
- [ ] Privacy policy updated for CRE use case
- [ ] Lease abstractor disclaimer on every output: "AI-generated. Review by qualified professional recommended."
- [ ] Voice agent vault isolation enforced architecturally (not toggleable)
- [ ] TCPA compliance for outbound voice (do-not-call list checking)
- [ ] SOC 2 Type I kickoff with EasyAudit (Month 2)
- [ ] Voice call recording disclosure (state-by-state consent requirements)

---

## What NOT to Build

The council was explicit about what to avoid:

- **No Google Docs / Outlook / Word integrations** until 10+ firms explicitly ask. "Copy" and "Export" are sufficient.
- **No national expansion** of CRE sales. Seed one city. Prove the model. Replicate.
- **No new Dante features** beyond bug fixes until SOC 2 is in hand and RIAs are buying.
- **No residential real estate features.** The market is commercial. Fair housing scanning is relevant for compliance but not the lead value prop.
- **No platform features** (public API, MCP integrations, custom embedding models) until PMF is proven at 20+ firms.
- **No investor outreach** until $100K+ ARR. Build with revenue, not pitches.

---

## The One Thing That Matters

The partner is closing deals. Everything in this plan serves one purpose: **give the partner what they need to close the next deal, and the next one after that.**

When in doubt about any priority, call the partner and ask: "What do you need to close the next firm?" Build that. Nothing else.
