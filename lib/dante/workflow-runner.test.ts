import { describe, it, expect } from "vitest";
import type {
  WorkflowDefinition,
  WorkflowGraph,
  GraphNode,
  GraphEdge,
} from "./workflow-types";

// ── Helper: build a minimal workflow definition ──────────────────

function makeGraph(nodes: GraphNode[], edges: GraphEdge[]): WorkflowGraph {
  return { nodes, edges };
}

function makeNode(
  id: string,
  type: string,
  step: Record<string, unknown>,
): GraphNode {
  return {
    id,
    type: type as GraphNode["type"],
    position: { x: 0, y: 0 },
    data: { step: { id, type, name: id, ...step } as any },
  };
}

function makeEdge(
  source: string,
  target: string,
  sourceHandle?: string,
): GraphEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    sourceHandle,
  };
}

function makeWorkflow(
  nodes: GraphNode[],
  edges: GraphEdge[],
): WorkflowDefinition {
  return {
    id: "test-wf",
    workspace_id: "test-ws",
    name: "Test Workflow",
    enabled: true,
    trigger: { type: "manual" },
    graph: makeGraph(nodes, edges),
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe("workflow-types: stepsToGraph", () => {
  it("creates a graph from a legacy step array", async () => {
    const { stepsToGraph } = await import("./workflow-types");
    const graph = stepsToGraph([
      { id: "s1", type: "http", config: { url: "https://example.com" } } as any,
      { id: "s2", type: "openai", config: { prompt: "hello" } } as any,
    ]);
    expect(graph.nodes).toHaveLength(3); // trigger + 2 steps
    expect(graph.edges).toHaveLength(2); // trigger->s1, s1->s2
    expect(graph.nodes[0].type).toBe("trigger_manual");
  });

  it("handles empty input", async () => {
    const { stepsToGraph } = await import("./workflow-types");
    const graph = stepsToGraph([]);
    expect(graph.nodes).toHaveLength(1); // just trigger
    expect(graph.edges).toHaveLength(0);
  });

  it("handles null input", async () => {
    const { stepsToGraph } = await import("./workflow-types");
    const graph = stepsToGraph(null);
    expect(graph.nodes).toHaveLength(1);
  });
});

describe("workflow-types: definitionFromRow", () => {
  it("builds definition from a DB row with graph", async () => {
    const { definitionFromRow } = await import("./workflow-types");
    const def = definitionFromRow({
      id: "wf-1",
      workspace_id: "ws-1",
      name: "My Workflow",
      description: null,
      enabled: true,
      trigger: { type: "manual" },
      graph: {
        nodes: [makeNode("trigger", "trigger_manual", { config: {} })],
        edges: [],
      },
    });
    expect(def.id).toBe("wf-1");
    expect(def.graph.nodes).toHaveLength(1);
  });

  it("falls back to legacy steps when graph is empty", async () => {
    const { definitionFromRow } = await import("./workflow-types");
    const def = definitionFromRow({
      id: "wf-2",
      workspace_id: "ws-2",
      name: "Legacy WF",
      description: null,
      enabled: true,
      trigger: { type: "manual" },
      graph: { nodes: [], edges: [] },
      steps: [
        { id: "s1", type: "http", config: { url: "https://test.com" } },
      ],
    });
    // Should have 2 nodes: auto-created trigger + s1
    expect(def.graph.nodes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("workflow-errors: friendlyError", () => {
  it("translates rate limit errors", async () => {
    const { friendlyError } = await import("./workflow-errors");
    const result = friendlyError("Email rate limit exceeded: 200/200 per hour. Wait for the next hour window.");
    expect(result.title).toBe("Send limit reached");
    expect(result.detail).toContain("200");
    expect(result.action).toBeDefined();
  });

  it("translates missing API key errors", async () => {
    const { friendlyError } = await import("./workflow-errors");
    const result = friendlyError("RESEND_API_KEY not configured");
    expect(result.title).toBe("Email not configured");
    expect(result.action).toContain("Settings");
  });

  it("translates code timeout", async () => {
    const { friendlyError } = await import("./workflow-errors");
    const result = friendlyError("Code node timed out after 5 seconds. Simplify your logic.");
    expect(result.title).toBe("Code node timed out");
  });

  it("translates HTTP errors", async () => {
    const { friendlyError } = await import("./workflow-errors");
    const r500 = friendlyError("HTTP 502: Bad Gateway");
    expect(r500.title).toContain("502");
    expect(r500.action).toContain("Retry");

    const r404 = friendlyError("HTTP 404: Not Found");
    expect(r404.title).toContain("404");
    expect(r404.action).toContain("URL");
  });

  it("returns a sane fallback for unknown errors", async () => {
    const { friendlyError } = await import("./workflow-errors");
    const result = friendlyError("Some random unexpected error occurred");
    expect(result.title).toBe("Workflow error");
    expect(result.detail).toContain("unexpected error");
  });

  it("caps very long error messages", async () => {
    const { friendlyError } = await import("./workflow-errors");
    const longMsg = "x".repeat(500);
    const result = friendlyError(longMsg);
    expect(result.detail.length).toBeLessThanOrEqual(303);
  });
});
