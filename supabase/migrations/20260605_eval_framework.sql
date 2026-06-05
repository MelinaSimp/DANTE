-- Eval framework tables for workflow and agent quality measurement.
--
-- Three-level structure:
--   dante_eval_suites   — named collection of test cases (e.g. "lease abstraction v1")
--   dante_eval_cases    — individual test inputs + expected outputs within a suite
--   dante_eval_runs     — one execution of a suite, with per-case results
--
-- Suites are workspace-scoped. Cases carry input payloads and optional
-- ground-truth assertions. Runs record actual outputs + scores so you
-- can track quality over time or across model changes.

-- ── Eval suites ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dante_eval_suites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  -- What kind of eval: "workflow", "agent", "tool", "prompt"
  eval_type   text NOT NULL DEFAULT 'workflow'
    CHECK (eval_type IN ('workflow', 'agent', 'tool', 'prompt')),
  -- Optional: tie to a specific workflow template
  workflow_id uuid REFERENCES dante_workflows(id) ON DELETE SET NULL,
  tags        text[] DEFAULT '{}',
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eval_suites_workspace ON dante_eval_suites(workspace_id);

ALTER TABLE dante_eval_suites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_bypass" ON dante_eval_suites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ws_member_read" ON dante_eval_suites
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM profiles WHERE id = auth.uid()
  ));

-- ── Eval cases ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dante_eval_cases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id    uuid NOT NULL REFERENCES dante_eval_suites(id) ON DELETE CASCADE,
  name        text NOT NULL,
  -- Input payload sent to the workflow/agent/tool
  input       jsonb NOT NULL DEFAULT '{}',
  -- Ground-truth expected output (optional — some evals are LLM-graded)
  expected    jsonb,
  -- Assertions to check against actual output
  -- e.g. [{"field": "output.tenant_name", "op": "eq", "value": "Great Clips"}]
  assertions  jsonb DEFAULT '[]',
  -- Relative weight for scoring (default 1.0)
  weight      numeric NOT NULL DEFAULT 1.0,
  tags        text[] DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eval_cases_suite ON dante_eval_cases(suite_id);

ALTER TABLE dante_eval_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_bypass" ON dante_eval_cases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ws_member_read" ON dante_eval_cases
  FOR SELECT TO authenticated
  USING (suite_id IN (
    SELECT id FROM dante_eval_suites WHERE workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  ));

-- ── Eval runs ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dante_eval_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id    uuid NOT NULL REFERENCES dante_eval_suites(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Which model/config was used
  model       text,
  config      jsonb DEFAULT '{}',
  -- Overall scores
  status      text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  total_cases int NOT NULL DEFAULT 0,
  passed      int NOT NULL DEFAULT 0,
  failed      int NOT NULL DEFAULT 0,
  score       numeric,  -- 0.0-1.0 weighted score
  -- Timing
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  -- Cost tracking
  total_tokens_in  int DEFAULT 0,
  total_tokens_out int DEFAULT 0,
  estimated_cost_cents int DEFAULT 0,
  -- Who triggered it
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eval_runs_suite ON dante_eval_runs(suite_id);
CREATE INDEX idx_eval_runs_workspace ON dante_eval_runs(workspace_id);

ALTER TABLE dante_eval_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_bypass" ON dante_eval_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ws_member_read" ON dante_eval_runs
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM profiles WHERE id = auth.uid()
  ));

-- ── Eval run results (per-case) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS dante_eval_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES dante_eval_runs(id) ON DELETE CASCADE,
  case_id     uuid NOT NULL REFERENCES dante_eval_cases(id) ON DELETE CASCADE,
  -- Actual output from the workflow/agent
  actual      jsonb,
  -- Per-assertion results
  -- e.g. [{"assertion_idx": 0, "passed": true, "actual_value": "Great Clips"}]
  assertion_results jsonb DEFAULT '[]',
  passed      boolean NOT NULL DEFAULT false,
  score       numeric,  -- 0.0-1.0
  -- LLM-as-judge grading (optional)
  llm_grade   text,     -- "pass", "fail", "partial"
  llm_reasoning text,
  -- Timing + cost
  duration_ms int,
  tokens_in   int DEFAULT 0,
  tokens_out  int DEFAULT 0,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eval_results_run ON dante_eval_results(run_id);
CREATE INDEX idx_eval_results_case ON dante_eval_results(case_id);

ALTER TABLE dante_eval_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_bypass" ON dante_eval_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ws_member_read" ON dante_eval_results
  FOR SELECT TO authenticated
  USING (run_id IN (
    SELECT id FROM dante_eval_runs WHERE workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  ));
