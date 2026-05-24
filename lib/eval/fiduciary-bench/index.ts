// lib/eval/fiduciary-bench/index.ts
//
// FiduciaryBench v1 — task registry + runner.
//
// Public API:
//   • TASKS — flat array of every defined task, in stable order.
//   • runTask(slug, instanceId, model) — execute one (task,
//     instance) pair against the configured model + agent loop,
//     persist the run + auto-grade if applicable, return the
//     run id and result.
//   • runAllTasks(model) — sweep every task × every instance.
//     Used by CI / nightly evals.

import type { EvalTask } from "./types";
import { FAIR_HOUSING_MARKETING } from "./tasks/fair-housing-marketing";

export const TASKS: EvalTask[] = [
  FAIR_HOUSING_MARKETING,
];

export function getTask(slug: string): EvalTask | undefined {
  return TASKS.find((t) => t.slug === slug);
}

export function listTaskSlugs(): string[] {
  return TASKS.map((t) => t.slug);
}

export type { EvalTask, EvalTaskInstance, RubricScore } from "./types";
