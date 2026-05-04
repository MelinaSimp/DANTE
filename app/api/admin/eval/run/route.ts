// app/api/admin/eval/run/route.ts
//
// Admin endpoint to trigger FiduciaryBench runs. Bearer auth via
// CRON_SECRET, matches the pattern of /api/dante/cron/* routes.
//
// Modes:
//   POST without query params       — sweep every task × every
//                                      instance against the default
//                                      model.
//   POST ?slug=<slug>               — run every instance of that
//                                      task.
//   POST ?slug=<slug>&instance=<id> — run a single instance.
//   POST ?model=<model>             — override the default model
//                                      (gpt-4o-mini); pair with the
//                                      others for targeted re-runs.
//
// Returns a summary: counts of attempted / completed / failed, plus
// the per-run results (run_id, task_slug, instance_id, output
// preview, auto_grade).
//
// This is the seam used to populate eval_runs / eval_grades for the
// public methodology page's "runs to date" counters and the future
// public leaderboard. Call it once after each task-corpus update,
// or wire it into a nightly cron once we have a stable model
// matrix to sweep against.

import { NextResponse } from "next/server";
import {
  runAllTasks,
  runTaskBySlug,
  type RunResult,
} from "@/lib/eval/fiduciary-bench/runner";
import { getTask } from "@/lib/eval/fiduciary-bench";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // sweeps take a while; eval models are sequential

function authOk(request: Request): boolean {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return bearer === secret;
}

async function handle(request: Request) {
  if (!authOk(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const instance = url.searchParams.get("instance");
  const model = url.searchParams.get("model") || undefined;

  const t0 = Date.now();
  const errors: Array<{ task_slug: string; instance_id: string; error: string }> = [];

  let results: RunResult[] = [];
  if (slug && instance) {
    try {
      const r = await runTaskBySlug(slug, instance, {
        model,
        triggered_by: "manual",
      });
      results = [r];
    } catch (err) {
      errors.push({
        task_slug: slug,
        instance_id: instance,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (slug) {
    const task = getTask(slug);
    if (!task) {
      return NextResponse.json(
        { error: `Unknown task slug: ${slug}` },
        { status: 404 },
      );
    }
    for (const inst of task.instances) {
      try {
        const r = await runTaskBySlug(slug, inst.id, {
          model,
          triggered_by: "manual",
        });
        results.push(r);
      } catch (err) {
        errors.push({
          task_slug: slug,
          instance_id: inst.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } else {
    results = await runAllTasks({
      model,
      triggered_by: "manual",
    });
  }

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - t0,
    model: model || "gpt-4o-mini (default)",
    completed: results.length,
    failed: errors.length,
    results: results.map((r) => ({
      run_id: r.run_id,
      task_slug: r.task_slug,
      instance_id: r.instance_id,
      duration_ms: r.duration_ms,
      auto_grade: r.auto_grade,
      output_preview: r.output.slice(0, 200),
    })),
    errors,
  });
}

export const GET = handle;
export const POST = handle;
