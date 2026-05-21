// lib/dante/cre-workflow-templates.ts
//
// Legacy re-export. All CRE templates now live in templates.ts.
// This file exists only so the /api/dante/workflows/cre-templates
// route doesn't break.

import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "./templates";

export type { WorkflowTemplate };

export const CRE_WORKFLOW_TEMPLATES = WORKFLOW_TEMPLATES.map((t) => ({
  key: t.slug,
  name: t.name,
  description: t.description,
  trigger: { type: t.triggerLabel.toLowerCase().includes("webhook") ? "webhook" as const : t.triggerLabel.toLowerCase().includes("manual") ? "manual" as const : "cron" as const },
  graph: t.graph,
}));
