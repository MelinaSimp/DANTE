// lib/eval/fiduciary-bench/types.ts
//
// FiduciaryBench v1 — type definitions for the eval framework.

export type RubricScore = {
  answer_quality: number;       // 0.0 - 1.0
  source_reliability: number;   // 0.0 - 1.0
  notes?: string;
};

export type EvalTaskCategory =
  | "fair_housing_review"
  | "marketing_review"
  | "zoning_compliance"
  | "lease_review";

export type EvalGraderKind = "auto" | "human";

/**
 * A FiduciaryBench task definition. Lives in code (lib/eval/
 * fiduciary-bench/tasks/*.ts) so the methodology stays version-
 * controlled and the public GitHub repo can carry the task corpus
 * without database access.
 *
 * Tasks are parameterized: `instances` defines specific scenarios
 * the runner instantiates. Each instance has inputs, an optional
 * reference answer (for auto-grading), and a free-text expectations
 * paragraph the human grader uses as their rubric anchor.
 */
export interface EvalTask {
  /** URL-safe slug, persistent across versions. */
  slug: string;
  version: string;
  category: EvalTaskCategory;
  /** Human-readable title for the methodology page. */
  title: string;
  /** What this task is measuring, in plain English. Surfaced on
   *  the methodology page under each task. */
  description: string;
  /** The prompt template — `{{var}}` placeholders filled from
   *  instance.inputs at runtime. */
  prompt_template: string;
  /** Vertical scope. Wealth-only / realtor-only / both. */
  industry_scope: Array<"real_estate">;
  /** Concrete scenarios this task runs against. */
  instances: EvalTaskInstance[];
  /** Optional auto-grader. When set, the runner computes a
   *  preliminary score against the reference answer; humans can
   *  override later. When null, only human grading applies. */
  auto_grader?: EvalAutoGrader;
}

export interface EvalTaskInstance {
  /** Stable id within the task — methodology references like
   *  "task=rmd_basic instance=traditional_72yo". */
  id: string;
  /** Inputs to fill the prompt_template. */
  inputs: Record<string, unknown>;
  /** Reference answer the auto-grader can score against. Free-form
   *  text or structured (depends on the task's auto_grader). */
  reference?: unknown;
  /** What a perfect human grade looks like. The human grader sees
   *  this as their rubric anchor — "compared to this, how did the
   *  model do?" */
  expectations: string;
}

export type EvalAutoGrader =
  | {
      kind: "exact_amount_within_tolerance";
      /** Path into the model's structured tool-call output where
       *  the numeric answer lives, e.g. ['result', 'required_amount']. */
      path: string[];
      /** Tolerance in dollars; default $0.50. */
      tolerance?: number;
    }
  | {
      kind: "must_cite_authority";
      /** Each authority that MUST appear in the cited sources.
       *  Pass-rate is fraction of authorities cited. */
      required: string[];
    }
  | {
      kind: "must_match_structured";
      /** Whitelist of fields that must match the reference object. */
      required_fields: string[];
    };
