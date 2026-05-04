-- 20260503_fiduciary_bench.sql
--
-- FiduciaryBench v1 — open-source eval framework for AI tools used
-- by registered investment advisors and real-estate brokerages.
-- Mirrors Harvey's BigLaw Bench in shape but designed for
-- fiduciary finance + brokerage compliance work, not legal.
--
-- Why it's structured this way:
--   • Tasks are DEFINED IN CODE (lib/eval/fiduciary-bench/tasks/*),
--     not in the database. The DB only stores RUNS and GRADES so
--     the methodology stays version-controlled and reproducible
--     (same reason Harvey put BigLaw Bench on GitHub).
--   • Each run executes a task against a model + prompt and
--     captures the model's output verbatim. Grading is a separate
--     step (eval_grades) so a retired CFP/CCO can grade after the
--     fact, possibly long after the run.
--   • Two rubrics per task — Answer Quality (does it match the
--     reference?) and Source Reliability (are the cited sources
--     real and on-point?). Same as BigLaw Bench. Stored as
--     separate scores per grade row.
--
-- The whole point of the framework: a sentence like "Drift matches
-- senior CCO output on 87% of compliance memos at 1/100th the time"
-- requires a public methodology, named human graders, and version-
-- controlled tasks. This schema is the persistence layer for that
-- claim.

CREATE TABLE IF NOT EXISTS eval_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- task_slug references a task defined in code; not an FK because
  -- task definitions live in the repo, not the DB.
  task_slug       text NOT NULL,
  task_version    text NOT NULL,
  -- The model + prompt rev that ran. agent_version helps when we
  -- compare runs across DriftAgent versions.
  model           text NOT NULL,
  agent_version   text,
  prompt_version  text,
  -- Inputs the task was instantiated with. Tasks are
  -- parameterized (e.g. "RMD for a holder born X with balance Y");
  -- inputs JSON captures the specific instantiation so grades can
  -- be compared apples-to-apples.
  inputs          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Verbatim model output. For chat/tool-use tasks, this is the
  -- final assistant message; agent traces (tool calls, citations)
  -- live in trace.
  output          text NOT NULL,
  trace           jsonb,
  -- Cost tracking — each run is a real $X.XX of OpenAI/Anthropic
  -- spend; aggregated across runs gives "$Y per task per model"
  -- for the public methodology page.
  prompt_tokens   int,
  completion_tokens int,
  total_tokens    int,
  duration_ms     int,
  -- Auto-graded scores from a reference answer (if the task has
  -- one). Null when the task requires human grading only.
  auto_answer_quality   numeric(4,3),
  auto_source_reliability numeric(4,3),
  auto_grade_notes      text,
  -- Provenance.
  triggered_by    text NOT NULL DEFAULT 'manual'
                       CHECK (triggered_by IN ('manual', 'cron', 'ci')),
  triggered_user  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_runs_task_idx
  ON eval_runs (task_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS eval_runs_model_idx
  ON eval_runs (model, created_at DESC);

CREATE TABLE IF NOT EXISTS eval_grades (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  -- Who graded. For automated grading set grader_kind='auto'; for
  -- human grading link to the grader's profile (in eval_graders).
  grader_kind     text NOT NULL CHECK (grader_kind IN ('auto', 'human')),
  grader_id       uuid,             -- references eval_graders.id when human
  -- The two rubrics. 0.0 - 1.0 each.
  answer_quality       numeric(4,3) NOT NULL,
  source_reliability   numeric(4,3) NOT NULL,
  -- Free-text rationale. For human graders this is the "why" — what
  -- they docked points for. For auto graders this is a structured
  -- diff against the reference answer.
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CHECK (answer_quality >= 0 AND answer_quality <= 1),
  CHECK (source_reliability >= 0 AND source_reliability <= 1)
);

CREATE INDEX IF NOT EXISTS eval_grades_run_idx
  ON eval_grades (run_id);

-- Graders directory — humans we hire to grade. Public-facing
-- methodology page surfaces grader.display_name and credentials so
-- the firm signing the contract knows whose judgment is behind the
-- numbers ("graded by Diane W., retired CCO of Smith RIA, 22 years
-- of regulatory exam experience").
CREATE TABLE IF NOT EXISTS eval_graders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name    text NOT NULL,
  credentials     text NOT NULL,           -- "CFP®, CCO at Smith Wealth Mgmt 1998-2024"
  bio             text,
  hourly_rate_cents int,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Public-read on graders + grades + runs (the whole point of the
-- framework is that the methodology is open). RLS allows
-- authenticated reads; writes are service-role only.
ALTER TABLE eval_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_grades  ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_graders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eval_runs_read ON eval_runs;
CREATE POLICY eval_runs_read ON eval_runs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS eval_grades_read ON eval_grades;
CREATE POLICY eval_grades_read ON eval_grades
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS eval_graders_read ON eval_graders;
CREATE POLICY eval_graders_read ON eval_graders
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE eval_runs IS
  'FiduciaryBench v1 — one row per (task, model, inputs) execution. Grades live separately in eval_grades so human grading can land async.';
COMMENT ON TABLE eval_grades IS
  'FiduciaryBench v1 — one row per grade against a run. Two rubrics: answer_quality and source_reliability, each 0-1. Both auto and human grades stored here, distinguished by grader_kind.';
COMMENT ON TABLE eval_graders IS
  'FiduciaryBench v1 — directory of human graders (retired CFPs, ex-CCOs, former examiners). Names + credentials shown on the public methodology page.';
