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

## Milestones, not days

Calendar dates are arbitrary. Ship to milestones.

### Milestone 1 — One grounded summary
Ship when: a call recording produces a summary where every bullet in
"Key Points" and "Action Items" has a hover tooltip showing the exact
transcript sentence + timestamp it came from. A "Verified: X/Y claims"
badge is visible. Nothing else ships until this does.

Scope:
- Store Whisper's verbose segments (we already request them, currently
  discard them).
- Change the summary prompt to return structured JSON with per-claim
  citations referencing segment IDs.
- Build a CallAuditView component rendering summary + transcript
  side-by-side with hover-to-verify.
- On the contact's note, detect call notes and surface a "View audit"
  button that opens the audit view.

Estimated effort: 1 week solo.

### Milestone 2 — Pre-meeting brief
Ship when: from a calendar item with a linked contact, we generate a
one-page brief with sections (Context / Open items / Talking points /
Risks). Every section cites which past note, annotation, or document
chunk it came from.

Scope:
- Retrieval over a client's prior 3 notes + document annotations.
- Pipeline: classify meeting type → retrieve → extract open action items
  → draft brief → cite every section.
- Same hover-to-verify UX, reusing the audit component from M1.

Estimated effort: 1–2 weeks after M1.

### Milestone 3 — Verification + audit packet
Ship when: any call note or meeting brief has a "Download audit packet"
button that produces a document (PDF or ZIP) containing: audio,
transcript, structured summary, cite map, brief, source chunks, formatted
for a compliance review.

Scope:
- Post-processing verification pass: extract every number, date, and
  proper noun from the output; match against retrieved chunks; flag
  unmatched claims in yellow.
- Audit packet generator endpoint.

Estimated effort: 3–5 days.

### Milestone 4 — Eval harness + published score
Ship when: we have a golden set of 40+ real advisor prompts, graded by a
CFP on a 1–5 rubric (accuracy / usefulness / grounding). Our pipeline
beats raw Claude by 1+ point on average. The number is published on the
landing page.

Scope:
- Write 40 prompts by hand, using real contacts in the seeded workspace.
- Manual grading rubric + simple runner.
- Landing page update showing the number honestly.

Estimated effort: 1 week, including CFP review.

### Milestone 5 — One design partner
Ship when: one real small RIA (1–20 advisors) is using the grounded
meeting workflow weekly and giving us 30 minutes of feedback every week.
Not paid yet, but committed.

Scope:
- 90-second Loom showing the audit packet flow.
- Cold email to 30 small RIAs. Target: 1 yes.
- Weekly feedback call cadence.

Estimated effort: depends on them, not us. 2–6 weeks of outreach.

### Milestone 6 — The yes-or-no
Ship when: our first design partner either agrees to pay $600/seat/month
or tells us why not. Either outcome is a win — we know which.

## What this plan explicitly refuses to do

- No SEC EDGAR ingestion. Not needed until M5 asks for it.
- No Cohere reranker. Overkill for one workflow.
- No 1,000-case eval. 40 is enough for month 1.
- No SOC 2, no SSO, no SCIM. Zero enterprise prospects today — these are
  solutions looking for problems.
- No new UI pages. If anything, we hide some (see B: Labs flag).
- No landing page rewrite until M4 gives us a real number to publish.

## What "done" looks like at M5

- One grounded workflow (meeting prep + recap) that a CCO would accept.
- A published accuracy score against a real golden set.
- An audit packet format a compliance officer can sign off on.
- One design partner using it weekly.
- Everything else in the product exists but is gated behind a Labs flag
  so new users see the sharp 20%, not the shallow 80%.

At that point, we earn the right to build M2 of the broader product —
IPS drafting, tax-loss harvesting, whatever the design partner says hurts
most. Not before.

## Non-goals for this plan

- Investor decks. A real product plan becomes the pitch as a side effect.
  If M1–M5 ship, the deck writes itself.
- Team hiring. One CFP co-authoring prompts for equity is the only hire
  that matters, and they come after M2 not before.
- Fundraising. Raising before M5 is raising on a façade.

## Failure modes to watch

1. **Scope creep mid-milestone.** If M1 starts growing past "hover-to-
   verify on call summaries," delete the extra scope.
2. **Filling time.** If M1 takes 3 days, ship it at day 3. Don't pad to
   a week. Move to M2 immediately.
3. **Polishing UI.** Every hour on animation, shadow, or typography is
   an hour not spent on grounding. The audit view should be ugly and
   functional until M5 says otherwise.
4. **Chasing the 10 Harvey items.** That list is a description of a
   company that took 2 years and $100M. Treating it as a to-do list is
   how we die.

## One-line test

If a compliance officer asks *"where did this answer come from?"* — can
we show them? If yes, we're on plan. If no, nothing else matters.
