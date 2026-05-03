# ADR 0011 — Provenance-First Citation Validation

**Date:** 2026-05-03
**Phase:** 4, W4.12
**Status:** Accepted

## Context

The citation validator (`lib/dante/citation-validator.ts`) was
originally substring-strict: a citation passed only if the cited
quote appeared as a verbatim substring of the cited chunk on the
cited page. This was intuitive but broke in practice.

Real-world test on a rent-roll document produced "37 of 37
citations failed verification" despite every citation being
correct. The cause: tabular documents (rent rolls, MLS sheets,
custodian statements, schedules) re-chunk between embed-time and
validate-time. Rows that landed together in chunk #3 at index
become chunk #5+#6 when re-processed. Substring matching fails
even though the document, the page, and the content are all
correct.

A 100% false-positive rate erodes user trust faster than no
validator at all. Users learn to ignore the warnings. Worse, the
warnings are wrong about what they're claiming — the citation
WAS correctly grounded in a real document; the chunk text just
shifted in storage.

## Decision

The validator's claim is now: **"this citation came from a real
document the agent retrieved in this run."**

Not: "this exact sentence appears at this exact location."

Verification proceeds in three nested tiers, each producing a
verification level:

```
strong       — quote substring matched a chunk on the cited page
confirmed    — quote substring matched some chunk in the document
              (any-chunk or cross-chunk match)
provenance   — document_id resolves in vault; quote drifted too
              much to substring-match. Still valid: the agent
              retrieved a real document and used it.
```

The level is surfaced in:
- The citation_report's audit JSON (per check)
- The chip ring color (emerald / light gold / neutral)
- Enterprise-tier compliance attestation (strong-only setting)

Failure remains failure for:
- `missing` — marker in text but no `vault.cite` call in trace
- `doc_missing` — cited document_id not in workspace's vault
- `page_mismatch` — cited page wildly out of bounds (>2× page_count)
- `unverifiable` — DB error / network during lookup

## Consequences

**Positive:**
- Citations on tabular documents validate correctly. False-positive rate drops from ~100% to near-zero.
- Audit trail carries the level; compliance officers see "what was actually verified" not just "verified or not."
- Enterprise tier can require strong-only attestation; lower tiers accept any non-failed level. Pricing alignment.
- Provenance check is a meaningful claim — vault.cite emits document_ids only from real workspace documents, so resolving the document_id is itself proof the agent retrieved real material.

**Negative / costs:**
- The validator no longer claims "this exact sentence appears at this exact location." A sufficiently sophisticated examiner asking "how do you know the model didn't paraphrase the quote" gets answered by "we verified the document is real, but the exact sentence may be re-flowed by the chunker."
- For 95%+ of buyers this is the right tradeoff. For the strictest 5% (FINRA-supervised broker-dealers in heavy litigation contexts), the strong-level attestation gates exist.

## Alternatives considered

- **Stay substring-strict.** Rejected — the false-positive rate on tabular content was unworkable.
- **Loosen the substring matcher more.** Rejected — making it lenient enough to catch the rent roll case made it lenient enough to falsely match unrelated content. Multi-tier tier with named levels is the principled answer.
- **Re-run the chunker on every validate.** Rejected — expensive, doesn't actually solve the problem (chunkers are nondeterministic in subtle ways).

## Implementation

- `lib/dante/citation-validator.ts` carries the multi-tier logic.
- Each `CitationCheck` with `status: "valid"` has a `level` field.
- The chip renderer (`app/dante/CitationRenderer.tsx`) reads `level` and applies `ring-emerald-600/40` (strong) / `ring-amber-500/30` (confirmed) / no ring (provenance).
- The eval suite gains adversarial cases (`evals/tasks/{advisor,realtor}/011-*.json`, `012-*.json`) that test refusal on missing data — the failure modes the looser validation must still catch.

## References

- Phase 3+ panel-followup batch.
- The "37 of 37 citations failed verification" production test that prompted the change.
- ADR 0001 (LLM adapter) — the validator is one of the load-bearing trust features the adapter exists to protect.
