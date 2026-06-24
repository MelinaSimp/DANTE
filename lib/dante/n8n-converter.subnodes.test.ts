import { describe, it, expect } from "vitest";
import { convertDriftToN8n } from "./n8n-converter";
import type { WorkflowGraph } from "./workflow-types";

// Approach B: an agent with connected Chat Model / Memory / Tool sub-nodes
// must collapse into a single driftAiAgent node with folded params, and the
// sub-nodes (+ their ai_* edges) must NOT be emitted to n8n.
describe("convertDriftToN8n — agent sub-node fold-in", () => {
  const graph: WorkflowGraph = {
    nodes: [
      { id: "trigger", type: "trigger_manual", position: { x: 0, y: 0 }, data: { step: { id: "trigger", type: "trigger_manual", name: "Trigger", config: {} } } },
      { id: "agent", type: "agent", position: { x: 200, y: 0 }, data: { step: { id: "agent", type: "agent", name: "Agent", config: { objective: "do it", tools: ["web.search"] } } } },
      { id: "cm", type: "chat_model", position: { x: 100, y: 200 }, data: { step: { id: "cm", type: "chat_model", name: "Chat model", config: { model: "claude-opus-4-8" } } } },
      { id: "mem", type: "agent_memory", position: { x: 200, y: 200 }, data: { step: { id: "mem", type: "agent_memory", name: "Memory", config: { kind: "conversation" } } } },
      { id: "tool1", type: "agent_tool", position: { x: 300, y: 200 }, data: { step: { id: "tool1", type: "agent_tool", name: "Tool", config: { tool: "vault.cite" } } } },
      { id: "tool2", type: "agent_tool", position: { x: 400, y: 200 }, data: { step: { id: "tool2", type: "agent_tool", name: "Tool", config: { tool: "cre.calculate" } } } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "agent" },
      { id: "e2", source: "cm", target: "agent", connectionType: "ai_model" },
      { id: "e3", source: "mem", target: "agent", connectionType: "ai_memory" },
      { id: "e4", source: "tool1", target: "agent", connectionType: "ai_tool" },
      { id: "e5", source: "tool2", target: "agent", connectionType: "ai_tool" },
    ],
  };

  const { workflow } = convertDriftToN8n(graph, "Test");

  it("emits exactly one agent node and no sub-nodes", () => {
    const agents = workflow.nodes.filter((n) => n.type === "n8n-nodes-drift-cre.driftAiAgent");
    expect(agents).toHaveLength(1);
    const subs = workflow.nodes.filter((n) => /chat_model|agent_memory|agent_tool/.test(n.type));
    expect(subs).toHaveLength(0);
  });

  it("folds connected tools (+ memory tools) into the agent params", () => {
    const agent = workflow.nodes.find((n) => n.type === "n8n-nodes-drift-cre.driftAiAgent")!;
    const tools = String((agent.parameters as Record<string, unknown>).tools || "");
    expect(tools).toContain("web.search");    // pre-existing config tool kept
    expect(tools).toContain("vault.cite");     // folded ai_tool
    expect(tools).toContain("cre.calculate");  // folded ai_tool
    expect(tools).toContain("memory.search");  // folded from ai_memory
  });

  it("drops the sub-node edges (no connection references a sub-node)", () => {
    const conns = workflow.connections;
    expect(conns["Chat model"]).toBeUndefined();
    expect(conns["Memory"]).toBeUndefined();
    expect(conns["Tool"]).toBeUndefined();
    // The real main edge survives.
    expect(conns["Trigger"]?.main?.[0]?.some((c) => c.node === "Agent")).toBe(true);
  });
});
