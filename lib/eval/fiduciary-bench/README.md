# FiduciaryBench

An open evaluation framework for AI tools used by registered investment advisors and real-estate brokerages.

Built in the spirit of [Harvey's BigLaw Bench](https://www.harvey.ai/blog/introducing-biglaw-bench) and [open-sourced for the same reason](https://github.com/harveyai/biglaw-bench): vendor-self-reported accuracy claims have no value at exam time. The only useful answer to *"how good is this AI at fiduciary work?"* is a public, reproducible eval framework where the tasks are defined in code, the graders are named humans with credentials, and the leaderboard is open to any tool that wants to be benchmarked.

## What's measured

Every task carries two rubrics:

| Rubric | What it scores |
|---|---|
| **Answer Quality** | Did the model produce the right substantive answer? Numeric correctness, regulatory accuracy, plain-English clarity. |
| **Source Reliability** | Are the cited sources real, on-point, and verifiable? Did it cite the controlling rule, or a tangential one? Did it invent citations? |

Each rubric scores 0.0–1.0. Auto-grading (against a reference answer) runs on tasks that admit it. **Human grading is the score that matters.** Auto-grades anchor the iteration loop; humans set the standard.

## Tasks (v1)

The v1 corpus has five tasks across three categories:

| Slug | Category | Vertical | Instances |
|---|---|---|---|
| `rmd_basic` | RMD calculation | Wealth | 4 — basic Uniform Lifetime, under-RMD-age, spousal Joint table, post-2033 SECURE 2.0 staircase |
| `rmd_inherited` | RMD calculation | Wealth | 3 — non-EDB post-RBD decedent, non-EDB pre-RBD decedent, EDB minor child stretch |
| `oba_disclosure` | Compliance judgment | Wealth | 3 — disclosable real-estate side activity, non-disclosable volunteering, ambiguous passive rental |
| `fair_housing_marketing` | Marketing review | Realtor | 4 — familial-status violation, single-preference violation, innocuous (no-flag), religious + familial double-violation |
| `compliance_memo` | Drafting | Wealth | 2 — quarterly-review rebalance discussion, volatility-concern conversation |

Total: 5 tasks × 16 instances. The corpus is intentionally small at v1 — better to be tight and accurate than broad and noisy. Expansion follows real-firm pilot feedback.

## Graders

The auto-grader does what it can — exact-amount-within-tolerance for math tasks, must-cite-authority for source-checks, must-match-structured for tasks with reference shape. It runs on every run for free.

The **human grading** layer is what makes the framework defensible. Grader profiles include:

- Display name + credentials (CFP®, ChFC®, Series 7/65/66, JD/LLM in Tax, retired CCO of named firms)
- Years of experience grading at this rubric level
- Hourly rate

These are surfaced on the public methodology page. The point: when a CCO at a prospective firm is evaluating Drift, they can see exactly whose judgment produced our quality scores. *Diane Whitlock, retired CCO of Smith Wealth Management, 22 years of regulatory exam experience* lands differently than "our internal QA team."

Hiring graders is operational — see ops/eval-graders.md for the recruitment + onboarding flow.

## How to run

```ts
// Single instance:
import { runTaskBySlug } from "@/lib/eval/fiduciary-bench/runner";
const result = await runTaskBySlug("rmd_basic", "traditional_72_2026", {
  model: "gpt-4o-mini",
});

// Full sweep:
import { runAllTasks } from "@/lib/eval/fiduciary-bench/runner";
const sweep = await runAllTasks({ model: "gpt-4o" });
```

Runs persist to `eval_runs`; auto-grades to `eval_grades` (grader_kind='auto'). Human grades land on the same `eval_grades` table via the admin grading UI (separate sprint).

## Adding a task

1. Create `lib/eval/fiduciary-bench/tasks/<slug>.ts` exporting an `EvalTask` constant.
2. Register in `lib/eval/fiduciary-bench/index.ts` `TASKS` array.
3. Run a manual sweep: `runTaskBySlug("<slug>", "<instance_id>")`.
4. Eyeball the output. Iterate the prompt template / instance inputs / expectations until the human grader's read of the model output matches the expectations text.
5. PR with a short rationale: what does this task measure, and why is it worth a slot in the corpus? Tasks compete for slots; the corpus is small on purpose.

## Why "FiduciaryBench" and not "DriftBench"

Vendor-named benchmarks fail on diligence. *We are 95% accurate on our own benchmark* loses an investor in five seconds. *Our tool scores higher than [competitor] on the FiduciaryBench framework that the industry runs against itself* survives.

The framework being industry-shared is the design intent. This is why the repo will move to its own org/repo on GitHub once the v1 task set stabilizes — not stay buried inside drift-crm/.

## Status

- [x] Schema (eval_runs, eval_grades, eval_graders) — applied
- [x] Task type definitions
- [x] v1 task corpus (5 tasks, 16 instances)
- [x] Runner with auto-grading
- [ ] Public methodology page (`/fiduciary-bench/methodology`) — sprint 2
- [ ] Admin human-grading UI — sprint 2
- [ ] First grader recruited and onboarded — operational, sprint 2
- [ ] First public leaderboard run — after sprint 2
- [ ] Repo split out to its own GitHub org — after first leaderboard
