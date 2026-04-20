// lib/dante/workflow-types.ts
//
// Step schema for Dante workflows. Kept as a single module so the
// runner, the REST API, and the React editor all agree on shape.
//
// Values in step.config can reference prior-step outputs with
// `{{steps.<id>.<path>}}` — the runner substitutes these before each
// step fires. See resolveTemplate() in workflow-runner.ts.

export type StepType =
  | "http"            // fetch() against any URL
  | "openai"          // chat completion → emits `text`
  | "query_clients"   // Supabase select on contacts, with filters
  | "update_contact"  // Supabase update on a single contact
  | "send_email"      // Resend email
  | "condition"       // stop/continue based on a JS-like expression
  | "delay";          // pause N seconds

export interface BaseStep {
  id: string;
  type: StepType;
  name?: string;
  on_error?: "stop" | "continue";
}

export interface HttpStep extends BaseStep {
  type: "http";
  config: {
    url: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: unknown;
  };
}

export interface OpenAIStep extends BaseStep {
  type: "openai";
  config: {
    model?: string;      // default gpt-4o-mini
    system?: string;
    prompt: string;
    max_tokens?: number;
  };
}

export interface QueryClientsStep extends BaseStep {
  type: "query_clients";
  config: {
    // Simple filter DSL — optional equality on any column.
    filter?: Record<string, string>;
    limit?: number;
  };
}

export interface UpdateContactStep extends BaseStep {
  type: "update_contact";
  config: {
    contact_id: string;
    patch: Record<string, unknown>;
  };
}

export interface SendEmailStep extends BaseStep {
  type: "send_email";
  config: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
  };
}

export interface ConditionStep extends BaseStep {
  type: "condition";
  config: {
    // Very small expression language: "{{steps.foo.text}} contains 'yes'"
    // or "{{steps.foo.score}} > 50". Evaluated in evaluateCondition().
    expression: string;
    on_false: "stop" | "continue";
  };
}

export interface DelayStep extends BaseStep {
  type: "delay";
  config: {
    seconds: number; // capped at 60 by the runner (long waits need a real queue)
  };
}

export type WorkflowStep =
  | HttpStep
  | OpenAIStep
  | QueryClientsStep
  | UpdateContactStep
  | SendEmailStep
  | ConditionStep
  | DelayStep;

export interface WorkflowDefinition {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  trigger: { type: "manual" };
  steps: WorkflowStep[];
}

export interface StepLogEntry {
  step_id: string;
  step_type: StepType;
  step_name: string;
  status: "success" | "error" | "skipped";
  started_at: string;
  finished_at: string;
  output?: unknown;
  error?: string;
}

export interface WorkflowRunResult {
  status: "success" | "error";
  log: StepLogEntry[];
  output: Record<string, unknown>; // keyed by step id
  error?: string;
}
