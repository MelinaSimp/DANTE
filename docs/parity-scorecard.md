# Parity Scorecard

The Drift dual-vertical strategy (ADR 0002) requires that every
product surface ship for both **Financial Advisors (Dante)** and
**Real Estate Agents (Vergil)** at comparable depth. This scorecard
is the standing review at sprint planning.

**Scoring legend:**
- Depth 1–5 per vertical (5 = exemplary, 1 = stub)
- Δ = `|advisor − realtor|`. Δ ≥ 2 is a parity flag.
- Status: ✅ on track | ⚠️ flagged | ❌ blocked

**Last reviewed:** 2026-05-02 (Phase 0 baseline)

---

## Surfaces

| Surface | Advisor | Realtor | Δ | Status | Notes |
|---|---:|---:|---:|---|---|
| Industry config (`lib/industry/config.ts`) | 4 | 4 | 0 | ✅ | Marketing copy + starter questions at parity. Tool whitelists per-vertical pending (Phase 3 W3.5). |
| Assistant chat (`/dante`) | 4 | 3 | 1 | ✅ | Same route, persona flips on `workspace.industry`. URL rename to `/assistant` deferred (ADR 0003). |
| Dashboard surface | 4 | 2 | 2 | ⚠️ | Advisor metrics (AUM, churn, retention) shipped. Realtor pipeline metrics (DOM, GCI, listings) pending. |
| Heavy entities schema | 4 | 1 | 3 | ❌ | `wm_*` tables (opportunities, tax insights, intelligence profiles) deep. `re_*` tables not yet created (Phase 2 W2.4). |
| Polymorphic contacts | 2 | 2 | 0 | ⚠️ | `contacts` table shared. `contact_extensions` JSONB pending (Phase 2). |
| Onboarding empty states | 3 | 2 | 1 | ⚠️ | Both ask industry; advisor has clearer first-step guidance. |
| Memory taxonomy | 3 | 3 | 0 | ✅ | `dante_memory.kind` is generic. Per-vertical `category` extension pending (Phase 3 W3.5). |
| Skills library | 3 | 3 | 0 | ✅ | 3 seeded per vertical. Target: 20+ each (Phase 3 W3.5). |
| Document vault | 4 | 3 | 1 | ✅ | Vault works for both. Versioning pending (Phase 2 W2.3). |
| System prompt depth | 4 | 3 | 1 | ⚠️ | Dante prompt more iterated than Vergil. Parity rewrite pending (Phase 3 W3.5). |
| Eval coverage | 0 | 0 | 0 | ❌ | No eval suite yet. Scaffold pending (Phase 1 W1.4). |
| Compliance flag taxonomies | 2 | 0 | 2 | ❌ | RIA flags exist informally; realtor (fair housing, disclosure) not built. |
| Integrations | 2 | 1 | 1 | ⚠️ | Advisor: gmail, holistiplan, wealthbox adapters. Realtor: MLS pending. |
| Retention defaults | 1 | 1 | 0 | ❌ | No per-workspace retention policy yet. Both verticals affected. |
| Notification surface | 0 | 0 | 0 | ❌ | No notification center; planned Phase 3. |
| Per-vertical telemetry | 1 | 1 | 0 | ⚠️ | LLM adapter now logs `feature` tag. Per-vertical segmentation in dashboards TBD. |
| Supervisor / review queue | 0 | 0 | 0 | ❌ | Phase 1 W1.2/W1.3 builds for both verticals. |
| Citation validator | 0 | 0 | 0 | ❌ | Phase 1 W1.1 priority — must validate both vault types. |

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
