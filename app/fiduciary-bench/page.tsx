// app/fiduciary-bench/page.tsx
//
// Public methodology page for FiduciaryBench. Renders the task
// corpus, the rationale, and (when populated) the leaderboard.
//
// Why this is publicly accessible (no auth gate): the whole point
// of an open eval framework is that prospects can read the
// methodology before they sign a contract. Vendor-self-reported
// numbers are dismissed in five seconds; an open methodology with
// named human graders survives diligence.
//
// What's NOT here yet (sprint-2 work):
//   • Live leaderboard pulling latest grades from eval_runs
//     /eval_grades — needs at least one full grading pass
//     completed first.
//   • Per-grader profile pages with credentials + bio.
//   • A "submit your tool to FiduciaryBench" inbound form.
//
// Those land in the public-methodology v2 sprint after we have
// the first grader hired and the first run-and-grade cycle done.

import Link from "next/link";
import { TASKS } from "@/lib/eval/fiduciary-bench";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  Github,
  ScrollText,
  Calculator,
  ShieldCheck,
  Home,
  FileSpreadsheet,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FiduciaryBench — open evaluation framework for fiduciary AI",
  description:
    "An open methodology for benchmarking AI tools used by registered investment advisors and real-estate brokerages. Tasks defined in code, graded by named retired CFPs and ex-CCOs.",
};

type TaskCount = { task_slug: string; runs: number };

async function loadStats(): Promise<{
  totalRuns: number;
  byTask: Map<string, number>;
}> {
  // Best-effort stats — page renders fine even if these queries
  // return nothing (e.g. on first-day deploy before any runs).
  try {
    const { count: total } = await supabaseAdmin
      .from("eval_runs")
      .select("id", { count: "exact", head: true });
    const { data: rows } = await supabaseAdmin
      .from("eval_runs")
      .select("task_slug")
      .limit(1000);
    const byTask = new Map<string, number>();
    for (const r of (rows || []) as TaskCount[]) {
      byTask.set(r.task_slug, (byTask.get(r.task_slug) || 0) + 1);
    }
    return { totalRuns: total || 0, byTask };
  } catch {
    return { totalRuns: 0, byTask: new Map() };
  }
}

const CATEGORY_ICON = {
  rmd_calculation: Calculator,
  oba_disclosure: ShieldCheck,
  fair_housing_review: Home,
  compliance_memo: ScrollText,
  form_adv_consistency: ScrollText,
  marketing_review: ScrollText,
  tax_loss_harvesting: Calculator,
  wash_sale_detection: Calculator,
} as const;

export default async function FiduciaryBenchPage() {
  const stats = await loadStats();

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="border-b border-[var(--rule)]">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <img
              src="/brand/logo-circle.png"
              alt="Drift"
              className="w-6 h-6 rounded-full object-cover"
            />
            <span className="text-base font-medium text-[var(--ink)]">Drift</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-[var(--ink-muted)]">
            <Link href="/status" className="hover:text-[var(--ink)] transition">
              Status
            </Link>
            <Link href="/terms" className="hover:text-[var(--ink)] transition">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-[var(--ink)] transition">
              Privacy
            </Link>
          </nav>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Hero */}
        <p className="label-section text-[var(--ink-subtle)]">
          Open evaluation framework
        </p>
        <h1 className="heading-display text-5xl mt-3">FiduciaryBench</h1>
        <p className="mt-4 text-[var(--ink-muted)] text-base max-w-2xl leading-relaxed">
          An open methodology for benchmarking AI tools used by registered
          investment advisors and real-estate brokerages. Tasks defined in
          code, graded by named retired CFPs and ex-CCOs, leaderboard open to
          any tool that wants to be benchmarked.
        </p>

        {/* Why */}
        <section className="mt-12">
          <h2 className="heading-display text-2xl mb-3">Why an open framework</h2>
          <div className="prose-body text-[var(--ink)] space-y-4">
            <p>
              Vendor-self-reported accuracy claims have no value at exam time.
              The only useful answer to{" "}
              <em>&ldquo;how good is this AI at fiduciary work?&rdquo;</em> is a
              public, reproducible eval framework where the tasks are defined
              in code, the graders are named humans with credentials, and the
              leaderboard is open to any tool that wants to be benchmarked.
            </p>
            <p>
              FiduciaryBench is built in the spirit of{" "}
              <a
                href="https://www.harvey.ai/blog/introducing-biglaw-bench"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] underline-offset-2 hover:underline"
              >
                Harvey&rsquo;s BigLaw Bench
              </a>{" "}
              — and{" "}
              <a
                href="https://github.com/harveyai/biglaw-bench"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] underline-offset-2 hover:underline"
              >
                open-sourced for the same reason
              </a>
              . The fiduciary-finance and brokerage compliance work isn&rsquo;t
              legal work; the tasks need to be different. But the
              architecture — task corpus in version control, two rubrics
              (Answer Quality + Source Reliability), human graders, public
              methodology — translates directly.
            </p>
          </div>
        </section>

        {/* Rubrics */}
        <section className="mt-12">
          <h2 className="heading-display text-2xl mb-3">What we measure</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="border border-[var(--rule)] rounded-md p-4">
              <div className="label-section mb-1.5">Answer Quality</div>
              <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                Did the model produce the right substantive answer? Numeric
                correctness, regulatory accuracy, plain-English clarity. Scored
                0.0&ndash;1.0.
              </p>
            </div>
            <div className="border border-[var(--rule)] rounded-md p-4">
              <div className="label-section mb-1.5">Source Reliability</div>
              <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                Are the cited sources real, on-point, and verifiable? Did it
                cite the controlling rule, or a tangential one? Did it invent
                citations? Scored 0.0&ndash;1.0.
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-[var(--ink-muted)]">
            Auto-grading runs against reference answers where the task admits
            it (deterministic math, must-cite-authority checks).{" "}
            <strong className="text-[var(--ink)]">
              Human grading is the score that matters.
            </strong>{" "}
            Auto-grades anchor the iteration loop; humans set the standard.
          </p>
        </section>

        {/* Task corpus */}
        <section className="mt-12">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="heading-display text-2xl">v1 task corpus</h2>
            <div className="text-sm text-[var(--ink-muted)]">
              {TASKS.length} task{TASKS.length === 1 ? "" : "s"} ·{" "}
              {TASKS.reduce((acc, t) => acc + t.instances.length, 0)} instances
            </div>
          </div>
          <p className="text-sm text-[var(--ink-muted)] mb-6">
            Tasks are defined in{" "}
            <code className="mono text-xs px-1.5 py-0.5 bg-[var(--canvas-subtle)] rounded">
              lib/eval/fiduciary-bench/tasks/
            </code>{" "}
            in the source repository. The corpus is intentionally small at v1
            — better tight and accurate than broad and noisy. Expansion follows
            real-firm pilot feedback.
          </p>

          <ol className="space-y-4">
            {TASKS.map((task) => {
              const Icon =
                CATEGORY_ICON[task.category as keyof typeof CATEGORY_ICON] ??
                FileSpreadsheet;
              const runCount = stats.byTask.get(task.slug) || 0;
              return (
                <li
                  key={task.slug}
                  className="border border-[var(--rule)] rounded-md p-5"
                >
                  <header className="flex items-start gap-3 mb-3">
                    <Icon
                      className="w-4 h-4 text-[var(--ink-muted)] mt-1 shrink-0"
                      strokeWidth={1.5}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-base font-medium text-[var(--ink)]">
                          {task.title}
                        </h3>
                        <code className="mono text-xs text-[var(--ink-subtle)] shrink-0">
                          {task.slug} · v{task.version}
                        </code>
                      </div>
                      <div className="text-xs text-[var(--ink-subtle)] mt-1 flex items-center gap-3">
                        <span>
                          {task.industry_scope.join(" · ").replace(/_/g, " ")}
                        </span>
                        <span>·</span>
                        <span>
                          {task.instances.length} instance
                          {task.instances.length === 1 ? "" : "s"}
                        </span>
                        {runCount > 0 && (
                          <>
                            <span>·</span>
                            <span>{runCount} runs to date</span>
                          </>
                        )}
                      </div>
                    </div>
                  </header>
                  <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                    {task.description}
                  </p>
                  {task.instances.length > 0 && (
                    <details className="mt-3 group">
                      <summary className="text-xs text-[var(--accent)] cursor-pointer hover:underline list-none">
                        Show instances ({task.instances.length})
                        <span className="ml-1 text-[var(--ink-subtle)] group-open:hidden">
                          ▸
                        </span>
                        <span className="ml-1 text-[var(--ink-subtle)] hidden group-open:inline">
                          ▾
                        </span>
                      </summary>
                      <ul className="mt-3 space-y-3 ml-3 border-l border-[var(--rule)] pl-4">
                        {task.instances.map((inst) => (
                          <li key={inst.id}>
                            <code className="mono text-[11px] text-[var(--ink-subtle)]">
                              {inst.id}
                            </code>
                            <p className="text-xs text-[var(--ink-muted)] leading-relaxed mt-0.5">
                              {inst.expectations}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {/* Graders */}
        <section className="mt-12">
          <h2 className="heading-display text-2xl mb-3">Graders</h2>
          <p className="text-sm text-[var(--ink-muted)] leading-relaxed mb-4">
            The auto-grader does what it can — exact-amount-within-tolerance for
            math tasks, must-cite-authority for source-checks. It runs on every
            run for free.
          </p>
          <p className="text-sm text-[var(--ink-muted)] leading-relaxed mb-4">
            <strong className="text-[var(--ink)]">
              Human grading is what makes the framework defensible.
            </strong>{" "}
            We hire retired CFPs, ex-CCOs, and former examiners. Grader
            profiles include name, credentials (CFP®, ChFC®, Series 65/66, JD/
            LLM in Tax, retired CCO of named firms), years of experience, and
            hourly rate.
          </p>
          <div className="border border-dashed border-[var(--rule)] rounded-md p-5 text-sm text-[var(--ink-muted)]">
            <strong className="text-[var(--ink)] block mb-1">
              Recruiting graders now
            </strong>
            <p className="leading-relaxed">
              The first cohort of FiduciaryBench graders will be named on this
              page once their profiles are live. If you&rsquo;re a retired CFP
              with regulatory or examination experience and want to grade,
              email{" "}
              <a
                href="mailto:driftaillc@gmail.com"
                className="text-[var(--accent)] hover:underline"
              >
                driftaillc@gmail.com
              </a>
              .
            </p>
          </div>
        </section>

        {/* Stats */}
        <section className="mt-12">
          <h2 className="heading-display text-2xl mb-3">Status</h2>
          <ul className="text-sm space-y-2">
            <li className="flex items-baseline justify-between">
              <span className="text-[var(--ink-muted)]">
                Schema, tasks, runner shipped
              </span>
              <span className="text-[var(--accent)]">live</span>
            </li>
            <li className="flex items-baseline justify-between">
              <span className="text-[var(--ink-muted)]">Total runs to date</span>
              <span className="mono tabular-nums">{stats.totalRuns}</span>
            </li>
            <li className="flex items-baseline justify-between">
              <span className="text-[var(--ink-muted)]">First grader hired</span>
              <span className="text-[var(--ink-subtle)] italic">
                pending sprint 2
              </span>
            </li>
            <li className="flex items-baseline justify-between">
              <span className="text-[var(--ink-muted)]">Public leaderboard</span>
              <span className="text-[var(--ink-subtle)] italic">
                pending first grading pass
              </span>
            </li>
            <li className="flex items-baseline justify-between">
              <span className="text-[var(--ink-muted)]">
                Repo extracted to standalone GitHub org
              </span>
              <span className="text-[var(--ink-subtle)] italic">
                pending v2 task corpus
              </span>
            </li>
          </ul>
        </section>

        {/* Github / contribute */}
        <section className="mt-12 border-t border-[var(--rule)] pt-8">
          <h2 className="heading-display text-2xl mb-3">Contribute</h2>
          <p className="text-sm text-[var(--ink-muted)] leading-relaxed mb-4">
            Tasks are defined in TypeScript and live in the Drift repo today;
            they will move to a standalone{" "}
            <span className="mono text-xs">fiduciary-bench/</span> repo on
            GitHub once the v1 corpus stabilizes. Pull requests for new tasks
            are welcome — each task should measure something the community
            cares about benchmarking, not something specific to any one
            vendor.
          </p>
          <div className="inline-flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            <Github className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>github.com/drift4/drift-crm/tree/main/lib/eval/fiduciary-bench</span>
          </div>
        </section>

        <div className="mt-12 text-center text-[11px] mono text-[var(--ink-subtle)]">
          © {new Date().getFullYear()} Drift AI · FiduciaryBench is open methodology
        </div>
      </div>
    </div>
  );
}
