// lib/agents/event-to-plan.ts
//
// Reduce a Drift agent SSE event stream into the AgentPlanTask[]
// shape the AgentPlan UI expects. Walks events in order, opens a
// new task on every `iteration_thinking`, and attaches each
// `tool_start` / `tool_end` pair as a subtask of the current task.
//
// Status semantics (so the UI's animated transitions read right):
//   • Tool that's started but hasn't ended → "in-progress"
//   • Tool that ended success → "completed"
//   • Tool that ended error   → "failed"
//   • Iteration whose tools have all ended → "completed"
//   • Iteration with at least one in-flight tool → "in-progress"
//   • The most recent iteration with no tools yet → "in-progress"
//   • Older iterations (any iteration that's been superseded by a
//     later iteration_thinking) → forced "completed" because the
//     agent loop has moved past them.
//
// The reducer is pure — same input always produces same output —
// so React can call it on every render without thrash. Keep it
// allocation-light; this runs on every SSE frame during chat.

import type { StreamEvent } from "@/app/dante/streamClient";
import type { AgentPlanTask, AgentPlanStatus } from "@/components/ui/agent-plan";

interface MutableTask {
  id: string;
  title: string;
  status: AgentPlanStatus;
  subtasks: Array<{
    id: string;
    title: string;
    description?: string;
    status: AgentPlanStatus;
    tools?: string[];
  }>;
}

/**
 * Map an in-flight stream's events to plan tasks. `streaming=false`
 * means the run is done — the trailing in-progress task gets
 * promoted to completed in that case (assuming the model returned
 * cleanly; failures are already marked via tool_end status).
 */
export function eventsToPlanTasks(
  events: StreamEvent[],
  streaming: boolean,
): AgentPlanTask[] {
  const tasks: MutableTask[] = [];
  let active: MutableTask | null = null;

  for (const ev of events) {
    if (ev.type === "iteration_thinking") {
      // Close out the previous iteration before opening a new one.
      // If the previous iteration still has any in-progress
      // subtasks they stay that way — that's a real condition (the
      // model moved on while a tool was still resolving).
      if (active) {
        active.status = computeTaskStatus(active);
      }
      active = {
        id: `iter-${ev.iteration}`,
        title: ev.summary || `Step ${ev.iteration + 1}`,
        status: "in-progress",
        subtasks: [],
      };
      tasks.push(active);
    } else if (ev.type === "tool_start") {
      if (!active) {
        // Tool fired before any iteration_thinking — synthesize
        // a generic wrapping task so the subtask still has a parent.
        active = {
          id: "iter-0",
          title: "Working…",
          status: "in-progress",
          subtasks: [],
        };
        tasks.push(active);
      }
      active.subtasks.push({
        id: ev.sub_id,
        title: prettyToolName(ev.tool_name),
        description: summarizeArgs(ev.args),
        status: "in-progress",
        tools: [ev.tool_name],
      });
    } else if (ev.type === "tool_end") {
      // Find the matching subtask anywhere in the task tree (usually
      // the last task, but be defensive for out-of-order events).
      for (let i = tasks.length - 1; i >= 0; i--) {
        const t = tasks[i];
        const sub = t.subtasks.find((s) => s.id === ev.sub_id);
        if (sub) {
          sub.status = ev.status === "success" ? "completed" : "failed";
          sub.description = summarizeOutput(ev.output, ev.error);
          break;
        }
      }
    }
  }

  // Final pass: roll iteration status up from subtask outcomes.
  for (let i = 0; i < tasks.length; i++) {
    const isLast = i === tasks.length - 1;
    if (isLast && streaming) {
      tasks[i].status = computeTaskStatus(tasks[i], { keepInProgress: true });
    } else {
      tasks[i].status = computeTaskStatus(tasks[i]);
    }
  }

  return tasks;
}

function computeTaskStatus(
  task: MutableTask,
  opts?: { keepInProgress?: boolean },
): AgentPlanStatus {
  if (task.subtasks.length === 0) {
    return opts?.keepInProgress ? "in-progress" : "completed";
  }
  const anyFailed = task.subtasks.some((s) => s.status === "failed");
  if (anyFailed) return "failed";
  const anyInProgress = task.subtasks.some((s) => s.status === "in-progress");
  if (anyInProgress) return "in-progress";
  return "completed";
}

function prettyToolName(raw: string): string {
  // Most Drift tool names are dot-cased like "memory.search",
  // "vault.cite", "rmd.calculate". The dot reads cleanly when left
  // alone; we only humanize the obvious internal names.
  switch (raw) {
    case "memory.search": return "Searching memory";
    case "vault.cite": return "Citing vault";
    case "archive.search": return "Searching archive";
    case "regulatory.search": return "Searching regulators";
    case "inconsistency.detect": return "Cross-doc check";
    case "clients.query": return "Querying clients";
    case "skill.run": return "Running skill";
    case "reminder.schedule": return "Scheduling reminder";
    default:
      return raw;
  }
}

function summarizeArgs(args: Record<string, unknown>): string | undefined {
  if (!args || Object.keys(args).length === 0) return undefined;
  const q = args.query ?? args.question ?? args.search ?? args.q;
  if (typeof q === "string" && q.length > 0) {
    return q.length > 120 ? q.slice(0, 117) + "…" : q;
  }
  // Fall back to the first string field.
  for (const v of Object.values(args)) {
    if (typeof v === "string" && v.length > 0) {
      return v.length > 120 ? v.slice(0, 117) + "…" : v;
    }
  }
  return undefined;
}

function summarizeOutput(output: unknown, error?: string): string | undefined {
  if (error) return `Error: ${error.slice(0, 200)}`;
  if (output === null || output === undefined) return undefined;
  if (typeof output === "string") {
    return output.length > 200 ? output.slice(0, 197) + "…" : output;
  }
  if (Array.isArray(output)) {
    return `Returned ${output.length} item${output.length === 1 ? "" : "s"}`;
  }
  if (typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if ("count" in obj && typeof obj.count === "number") {
      return `Returned ${obj.count} hit${obj.count === 1 ? "" : "s"}`;
    }
    if ("hits" in obj && Array.isArray(obj.hits)) {
      return `Returned ${obj.hits.length} hit${obj.hits.length === 1 ? "" : "s"}`;
    }
  }
  return undefined;
}
