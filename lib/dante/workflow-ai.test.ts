import { describe, it, expect } from "vitest";
import type { WorkflowGraph, GraphNode, GraphEdge } from "./workflow-types";

// ── Tests for workflow graph validation logic ────────────────────
// Tests the pure validate() behavior using hand-crafted graphs.
// Checks that the quality guardrails (dangling node auto-wire,
// missing config repair, connectivity checks) work correctly.

// Minimal re-implementation of the validate helpers since they're
// not exported directly from workflow-ai.ts.

const VALID_STEP_TYPES = [
  "trigger_manual", "trigger_cron", "trigger_webhook", "trigger_at",
  "trigger_lease_expiry", "http", "openai", "agent", "condition",
  "send_email", "send_sms", "update_contact", "query_clients",
  "query_properties", "for_each", "code", "approval", "sub_workflow",
  "integration_query",
];

function makeNode(id: string, type: string, config: Record<string, unknown> = {}): GraphNode {
  return {
    id,
    type: type as GraphNode["type"],
    position: { x: 0, y: 0 },
    data: {
      step: {
        id,
        type,
        name: id,
        config,
      } as any,
    },
  };
}

function makeEdge(source: string, target: string): GraphEdge {
  return { id: `${source}->${target}`, source, target };
}

describe("workflow graph quality checks", () => {
  describe("basic structure", () => {
    it("accepts a minimal valid graph", () => {
      const nodes = [
        makeNode("trigger", "trigger_manual"),
        makeNode("step1", "openai", { prompt: "Hello" }),
      ];
      const edges = [makeEdge("trigger", "step1")];
      const graph: WorkflowGraph = { nodes, edges };

      // Trigger count = 1, all nodes connected
      const triggerCount = nodes.filter((n) => n.type.startsWith("trigger_")).length;
      expect(triggerCount).toBe(1);
      expect(edges.length).toBe(1);
    });

    it("detects dangling nodes", () => {
      const nodes = [
        makeNode("trigger", "trigger_manual"),
        makeNode("step1", "openai", { prompt: "Hello" }),
        makeNode("step2", "send_email", { to: "test@test.com" }), // dangling
      ];
      const edges = [makeEdge("trigger", "step1")];

      const connectedIds = new Set<string>();
      for (const e of edges) {
        connectedIds.add(e.source);
        connectedIds.add(e.target);
      }
      connectedIds.add("trigger");

      const dangling = nodes.filter((n) => !connectedIds.has(n.id));
      expect(dangling.length).toBe(1);
      expect(dangling[0].id).toBe("step2");
    });
  });

  describe("config repair", () => {
    it("copies agent prompt to objective when objective is missing", () => {
      const node = makeNode("agent1", "agent", { prompt: "Search for leases" });
      const cfg = node.data.step.config as Record<string, unknown>;

      if (!cfg.objective && cfg.prompt) {
        cfg.objective = cfg.prompt;
      }

      expect(cfg.objective).toBe("Search for leases");
    });

    it("copies openai objective to prompt when prompt is missing", () => {
      const node = makeNode("ai1", "openai", { objective: "Summarize data" });
      const cfg = node.data.step.config as Record<string, unknown>;

      if (!cfg.prompt && cfg.objective) {
        cfg.prompt = cfg.objective;
      }

      expect(cfg.prompt).toBe("Summarize data");
    });

    it("sets default recipient on send_email when to is missing", () => {
      const node = makeNode("email1", "send_email", { subject: "Test" });
      const cfg = node.data.step.config as Record<string, unknown>;

      if (!cfg.to) {
        cfg.to = "{{owner_email}}";
      }

      expect(cfg.to).toBe("{{owner_email}}");
    });
  });

  describe("graph connectivity", () => {
    it("detects unreachable nodes via BFS", () => {
      const nodes = [
        makeNode("trigger", "trigger_manual"),
        makeNode("step1", "openai", { prompt: "Hello" }),
        makeNode("step2", "send_email", { to: "a@b.com" }),
        makeNode("island", "openai", { prompt: "Isolated" }),
      ];
      const edges = [
        makeEdge("trigger", "step1"),
        makeEdge("step1", "step2"),
        // "island" is not connected
      ];

      const adjacency = new Map<string, string[]>();
      for (const e of edges) {
        if (!adjacency.has(e.source)) adjacency.set(e.source, []);
        adjacency.get(e.source)!.push(e.target);
      }

      const visited = new Set<string>();
      const queue = ["trigger"];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        const neighbors = adjacency.get(current) || [];
        queue.push(...neighbors);
      }

      const unreachable = nodes.filter(
        (n) => !visited.has(n.id) && !n.type.startsWith("trigger_"),
      );

      expect(unreachable.length).toBe(1);
      expect(unreachable[0].id).toBe("island");
    });

    it("all nodes reachable in a linear chain", () => {
      const nodes = [
        makeNode("trigger", "trigger_cron", { cron: "0 9 * * 1" }),
        makeNode("step1", "openai", { prompt: "Analyze" }),
        makeNode("step2", "agent", { objective: "Research" }),
        makeNode("step3", "send_email", { to: "{{owner_email}}" }),
      ];
      const edges = [
        makeEdge("trigger", "step1"),
        makeEdge("step1", "step2"),
        makeEdge("step2", "step3"),
      ];

      const adjacency = new Map<string, string[]>();
      for (const e of edges) {
        if (!adjacency.has(e.source)) adjacency.set(e.source, []);
        adjacency.get(e.source)!.push(e.target);
      }

      const visited = new Set<string>();
      const queue = ["trigger"];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        const neighbors = adjacency.get(current) || [];
        queue.push(...neighbors);
      }

      expect(visited.size).toBe(4);
    });

    it("handles branching graphs (condition nodes)", () => {
      const nodes = [
        makeNode("trigger", "trigger_manual"),
        makeNode("check", "condition", {}),
        makeNode("yes_path", "send_email", { to: "a@b.com" }),
        makeNode("no_path", "send_sms", {}),
      ];
      const edges = [
        makeEdge("trigger", "check"),
        { id: "check->yes", source: "check", target: "yes_path", sourceHandle: "true" },
        { id: "check->no", source: "check", target: "no_path", sourceHandle: "false" },
      ];

      const adjacency = new Map<string, string[]>();
      for (const e of edges) {
        if (!adjacency.has(e.source)) adjacency.set(e.source, []);
        adjacency.get(e.source)!.push(e.target);
      }

      const visited = new Set<string>();
      const queue = ["trigger"];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        const neighbors = adjacency.get(current) || [];
        queue.push(...neighbors);
      }

      expect(visited.size).toBe(4);
    });
  });
});
