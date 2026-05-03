# Parity Scorecard

The Drift dual-vertical strategy (ADR 0002) requires that every
product surface ship for both **Financial Advisors (Dante)** and
**Real Estate Agents (Vergil)** at comparable depth. This scorecard
is the standing review at sprint planning.

**Scoring legend:**
- Depth 1–5 per vertical (5 = exemplary, 1 = stub)
- Δ = `|advisor − realtor|`. Δ ≥ 2 is a parity flag.
- Status: ✅ on track | ⚠️ flagged | ❌ blocked

**Last reviewed:** 2026-05-02 (Phase 0–3 execution snapshot)

---

## Surfaces

| Surface | Advisor | Realtor | Δ | Status | Notes |
|---|---:|---:|---:|---|---|
| Industry config (`lib/industry/config.ts` + `vertical-spec.ts`) | 5 | 5 | 0 | ✅ | Marketing copy at parity; per-vertical tool whitelists, memory taxonomy, compliance flags, retention defaults shipped (vertical-spec.ts). |
| Assistant chat (`/dante`) | 4 | 4 | 0 | ✅ | Same route, persona flips on `workspace.industry`. Tool whitelist now per-vertical. URL rename to `/assistant` deferred (ADR 0003). |
| Dashboard surface | 4 | 2 | 2 | ⚠️ | Advisor metrics shipped. Realtor pipeline metrics (DOM, GCI, listings) pending (PARITY-004). |
| Heavy entities schema | 4 | 4 | 0 | ✅ | `wm_*` advisor tables + `re_*` realtor tables (re_listings/tours/offers/transactions) at parity. |
| Polymorphic contacts | 4 | 4 | 0 | ✅ | `contact_extensions` JSONB shipped — RIA: AUM/risk; realtor: stage/price range. |
| Onboarding empty states | 3 | 2 | 1 | ⚠️ | Realtor empty states pending (PARITY-010). |
| Memory taxonomy | 5 | 5 | 0 | ✅ | Per-vertical category lists in vertical-spec.ts. Persisted via `dante_memory.metadata.category`. |
| Skills library | 3 | 3 | 0 | ✅ | 3 seeded per vertical; expansion targets registered. Full 20+ pending (PARITY-005 follow-up). |
| Document vault | 5 | 5 | 0 | ✅ | Vault works for both. Versioning shipped (`dante_archive_versions`). |
| System prompt depth | 5 | 5 | 0 | ✅ | `prompts/dante-v3.md` and `prompts/vergil-v3.md` at parity depth (length, sections, exemplars). Versioned in repo. |
| Eval coverage | 4 | 4 | 0 | ✅ | 10 advisor + 10 realtor tasks. Runner with parity-delta flag at Δ ≥ 10%. Expansion to 100/100 pending. |
| Compliance flag taxonomies | 4 | 4 | 0 | ✅ | RIA (4 codes) + realtor (4 codes incl. fair-housing-risk) defined in vertical-spec.ts. Scanner wiring pending (PARITY-007/008). |
| Integrations | 2 | 1 | 1 | ⚠️ | Advisor adapters present. MLS adapter pending (PARITY-009). |
| Retention defaults | 4 | 4 | 0 | ✅ | `workspace_retention_policies` shipped; per-vertical defaults defined in vertical-spec.ts. |
| Notification surface | 0 | 0 | 0 | ❌ | No notification center; planned future Phase 4. |
| Per-vertical telemetry | 2 | 2 | 0 | ⚠️ | LLM adapter logs `feature` tag. Billing meters carry `vertical` column. Per-vertical dashboards pending. |
| Supervisor / review queue | 5 | 5 | 0 | ✅ | `outbound_review_queue` for autonomous outputs + memory `review_status` for AI-written facts. Both verticals at parity. |
| Citation validator | 5 | 5 | 0 | ✅ | Page-bound + quote-substring validation against `dante_archive_chunks`. Wired into `/api/dante/ask` as final SSE frame. |
| Soft deletes | 4 | 4 | 0 | ✅ | `deleted_at` on contacts, documents, memories, conversations. Retention worker pending. |
| LLM provider abstraction | 5 | 5 | 0 | ✅ | `lib/llm/client.ts` adapter; 10 SDK sites migrated. ~28 raw-fetch sites tracked under PARITY-001. |
| Rate limiting | 4 | 4 | 0 | ✅ | Token-bucket per (workspace, route). Wired into `/api/dante/ask`. |
| Stripe metered billing | 3 | 3 | 0 | ⚠️ | Aggregator skeleton + schema shipped. Live submission gated behind `STRIPE_METERED_ENABLED=1` until SKU surface finalized. |

---

## Open parity items (PARITY-XXX tickets)

| ID | Title | Phase | Owner |
|---|---|---|---|
| PARITY-001 | Migrate ~28 remaining raw-fetch OpenAI sites to LLM adapter | Phase 2 cleanup | Backend |
| PARITY-002 | Rename `/api/dante/*` → `/api/assistant/*` | Phase 2 | Backend |
| PARITY-003 | Build `re_listings`, `re_tours`, `re_offers`, `re_transactions` schema | Phase 2 W2.4 | Backend |
| PARITY-004 | Realtor pipeline dashboard metrics (DOM, GCI, listings) | Phase 3 W3.4 | Frontend |
| PARITY-005 | Vergil v3 prompt at depth parity with Dante v3 | Phase 3 W3.5 | AI |
| PARITY-006 | Vertical-aware tool whitelists in `lib/industry/config.ts` | Phase 3 W3.5 | AI |
| PARITY-007 | Fair housing scanner (deterministic + model pass) | Phase 3 W3.7 | Compliance |
| PARITY-008 | RIA compliance flag taxonomy (formal) | Phase 3 W3.7 | Compliance |
| PARITY-009 | MLS adapter (RESO Web API) | Phase 3 W3.6 | Integrations |
| PARITY-010 | Realtor empty states for dashboard, contacts, vault | Phase 3 W3.4 | Frontend |

---

## Review cadence

- **Sprint planning:** Update Δ scores; flag any new ❌ items for next sprint.
- **Phase exit:** All gates from ADR 0002 must pass before phase closes.
- **Quarterly:** Re-baseline depth scores; archive resolved PARITY tickets.
