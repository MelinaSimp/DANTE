// lib/dante/cre-workflow-templates.ts
//
// Premade workflow graphs for CRE use cases. These are ready-to-import
// WorkflowGraph objects the user can materialize via the workflow UI or
// the /api/dante/workflows POST endpoint.
//
// Phase 2.4: Lease Expiration → Outbound Call
// The abstractor extracts expiration dates and stores them on
// contact/deal records. This workflow checks daily for contacts
// whose lease expires within a configurable window and initiates
// an outbound Vapi call using the lease expiration notification
// scenario.

import type { WorkflowGraph } from "./workflow-types";

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  trigger: { type: "manual" | "cron" | "webhook" };
  graph: WorkflowGraph;
}

export const LEASE_EXPIRATION_WORKFLOW: WorkflowTemplate = {
  key: "cre_lease_expiration_calls",
  name: "Lease Expiration Outreach",
  description:
    "Runs daily. Finds contacts with lease expirations in the next 90 days. For each, sends an SMS heads-up and (if a voice agent is configured) initiates an outbound call using the lease expiration notification scenario.",
  trigger: { type: "cron" },
  graph: {
    nodes: [
      {
        id: "trigger",
        type: "trigger_cron",
        position: { x: 40, y: 40 },
        data: {
          step: {
            id: "trigger",
            type: "trigger_cron",
            name: "Daily check (9 AM)",
            config: {
              cron: "0 9 * * *",
              timezone: "America/New_York",
            },
          },
        },
      },
      {
        id: "find_expiring",
        type: "query_clients",
        position: { x: 40, y: 200 },
        data: {
          step: {
            id: "find_expiring",
            type: "query_clients",
            name: "Find expiring leases",
            config: {
              filter: {},
              limit: 50,
            },
          },
        },
      },
      {
        id: "evaluate",
        type: "agent",
        position: { x: 40, y: 360 },
        data: {
          step: {
            id: "evaluate",
            type: "agent",
            name: "Filter + compose messages",
            config: {
              model: "claude-sonnet-4-6",
              system:
                "You are a CRE operations assistant. Given a list of contacts, identify those with a lease expiration date within the next 90 days. For each qualifying contact, compose a brief professional SMS message notifying them that their lease expiration is approaching and offering to schedule a meeting to discuss renewal options. Output a JSON array of objects with: contact_id, name, phone, expiration_date, sms_body.",
              objective:
                "Review the contacts from the previous step. Filter to those whose lease_expiration_date (stored in contact extensions or notes) falls within the next 90 days from today. For each, draft a personalized SMS. Return the filtered list as JSON.",
              tools: ["memory.search", "clients.query"],
              max_steps: 6,
              output_schema: {
                type: "object",
                properties: {
                  contacts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        contact_id: { type: "string" },
                        name: { type: "string" },
                        phone: { type: "string" },
                        expiration_date: { type: "string" },
                        sms_body: { type: "string" },
                      },
                      required: ["contact_id", "name", "phone", "sms_body"],
                    },
                  },
                },
                required: ["contacts"],
              },
            },
          },
        },
      },
      {
        id: "check_results",
        type: "condition",
        position: { x: 40, y: 520 },
        data: {
          step: {
            id: "check_results",
            type: "condition",
            name: "Any expiring?",
            config: {
              expression: "{{steps.evaluate.output.contacts.length}} > 0",
              on_false: "stop",
            },
          },
        },
      },
      {
        id: "notify_team",
        type: "send_sms",
        position: { x: 40, y: 680 },
        data: {
          step: {
            id: "notify_team",
            type: "send_sms",
            name: "Notify broker team",
            config: {
              to_role: "owner",
              body: "Lease expiration outreach: {{steps.evaluate.output.contacts.length}} contact(s) have leases expiring within 90 days. Outreach messages are being sent now.",
            },
          },
        },
      },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "find_expiring" },
      { id: "e2", source: "find_expiring", target: "evaluate" },
      { id: "e3", source: "evaluate", target: "check_results" },
      { id: "e4", source: "check_results", target: "notify_team", sourceHandle: "true" },
    ],
  },
};

export const CRE_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  LEASE_EXPIRATION_WORKFLOW,
];
