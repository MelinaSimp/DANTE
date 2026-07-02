import { describe, it, expect } from "vitest";
import { applyWorkflowSurgery, type StructuralOp } from "./workflow-surgery";

// ── Fixtures ──────────────────────────────────────────────────

type LooseConnections = Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;

/** n8n-native graph shaped like a hand-crafted template clone:
 *  webhook → agent → email → report. */
function n8nGraph(): { nodes: Array<{ id: string; name: string; type: string; typeVersion: number; position: number[]; parameters: Record<string, unknown>; credentials?: Record<string, unknown> }>; connections: LooseConnections } {
  return {
    nodes: [
      { id: "trigger", name: "Run", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [80, 80], parameters: { path: "x", httpMethod: "POST" } },
      { id: "scan", name: "Analyze", type: "n8n-nodes-drift-cre.driftAiAgent", typeVersion: 1, position: [80, 240], parameters: { objective: "do it", tools: "", maxSteps: 4 }, credentials: { driftCreApi: { id: "1", name: "Drift CRE" } } },
      { id: "email", name: "Send Digest", type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [80, 400], parameters: { url: "https://api.resend.com/emails", method: "POST", jsonBody: "={{ JSON.stringify({to: 'a@b.c'}) }}" } },
      { id: "report-to-drift", name: "Report to Drift", type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [80, 560], parameters: { url: "={{$env.DRIFT_CALLBACK_URL}}/api/dante/n8n/execution-callback", method: "POST" } },
    ],
    connections: {
      "Run": { main: [[{ node: "Analyze", type: "main", index: 0 }]] },
      "Analyze": { main: [[{ node: "Send Digest", type: "main", index: 0 }]] },
      "Send Digest": { main: [[{ node: "Report to Drift", type: "main", index: 0 }]] },
    },
  };
}

/** Editor-format graph: trigger → email. */
function driftGraph() {
  return {
    nodes: [
      { id: "trigger", type: "trigger_manual", position: { x: 80, y: 40 }, data: { step: { id: "trigger", type: "trigger_manual", name: "Run", config: {} } } },
      { id: "email", type: "send_email", position: { x: 80, y: 190 }, data: { step: { id: "email", type: "send_email", name: "Send Digest", config: { to: "a@b.c", subject: "s", text: "t" } } } },
    ],
    edges: [{ id: "e1", source: "trigger", target: "email" }],
  };
}

// ── n8n-native shape ──────────────────────────────────────────

describe("workflow surgery on n8n-native graphs", () => {
  it("swaps an email node to SMS, keeping connections intact by name", () => {
    const g = n8nGraph();
    const ops: StructuralOp[] = [
      { op: "change_type", node: "Send Digest", new_type: "send_sms", config: { to_phone: "+12165551234", body: "digest: {{steps.scan.text}}" } },
    ];
    const res = applyWorkflowSurgery(g, ops);
    expect(res.errors).toEqual([]);
    const node = g.nodes.find((n) => n.name === "Send Digest")!;
    expect(node.type).toBe("n8n-nodes-base.httpRequest");
    expect(String(node.parameters!.url)).toContain("/api/sms/workflow-send");
    expect(String(node.parameters!.jsonBody)).toContain("+12165551234");
    // Connections untouched (same name)
    expect(g.connections["Analyze"].main[0][0].node).toBe("Send Digest");
    expect(g.connections["Send Digest"].main[0][0].node).toBe("Report to Drift");
  });

  it("renames connections when change_type includes new_name", () => {
    const g = n8nGraph();
    applyWorkflowSurgery(g, [
      { op: "change_type", node: "Send Digest", new_type: "send_sms", config: { to_phone: "+1", body: "b" }, new_name: "Text Broker" },
    ]);
    expect(g.connections["Analyze"].main[0][0].node).toBe("Text Broker");
    expect(g.connections["Text Broker"].main[0][0].node).toBe("Report to Drift");
    expect((g.connections as Record<string, unknown>)["Send Digest"]).toBeUndefined();
  });

  it("adds a node wired between two existing nodes", () => {
    const g = n8nGraph();
    const res = applyWorkflowSurgery(g, [
      { op: "add_node", type: "send_sms", name: "Also Text", config: { to_phone: "+1", body: "hi" }, connect_from: "Analyze", connect_to: "Report to Drift" },
    ]);
    expect(res.errors).toEqual([]);
    expect(g.nodes.some((n) => n.name === "Also Text")).toBe(true);
    expect(g.connections["Analyze"].main[0].some((c) => c.node === "Also Text")).toBe(true);
    expect(g.connections["Also Text"].main[0][0].node).toBe("Report to Drift");
  });

  it("removes a node and heals the chain around it", () => {
    const g = n8nGraph();
    const res = applyWorkflowSurgery(g, [{ op: "remove_node", node: "Send Digest" }]);
    expect(res.errors).toEqual([]);
    expect(g.nodes.some((n) => n.name === "Send Digest")).toBe(false);
    // Analyze now feeds Report to Drift directly.
    expect(g.connections["Analyze"].main[0].some((c) => c.node === "Report to Drift")).toBe(true);
    expect((g.connections as Record<string, unknown>)["Send Digest"]).toBeUndefined();
  });

  it("rejects incomplete config patches on delivery nodes with a helpful error", () => {
    const g = n8nGraph();
    const res = applyWorkflowSurgery(g, [
      { op: "set_config", node: "Send Digest", config_patch: { to: "new@x.com" } },
    ]);
    expect(res.errors.length).toBe(1);
    expect(res.errors[0]).toContain("complete config");
  });

  it("rebuilds a delivery node when the complete config is provided", () => {
    const g = n8nGraph();
    const res = applyWorkflowSurgery(g, [
      { op: "set_config", node: "Send Digest", config_patch: { to: "new@x.com", subject: "s", text: "t" } },
    ]);
    expect(res.errors).toEqual([]);
    const node = g.nodes.find((n) => n.name === "Send Digest")!;
    expect(String(node.parameters!.jsonBody)).toContain("new@x.com");
  });

  it("translates template keys when patching Drift CRE node config", () => {
    const g = n8nGraph();
    // agent nodes accept objective directly
    const res = applyWorkflowSurgery(g, [
      { op: "set_config", node: "Analyze", config_patch: { objective: "new objective" } },
    ]);
    expect(res.errors).toEqual([]);
    const node = g.nodes.find((n) => n.name === "Analyze")!;
    expect(String(node.parameters!.objective)).toContain("new objective");
  });

  it("reports unknown nodes and types as per-op errors", () => {
    const g = n8nGraph();
    const res = applyWorkflowSurgery(g, [
      { op: "remove_node", node: "Nope" },
      { op: "change_type", node: "Send Digest", new_type: "not_a_type", config: {} },
    ]);
    expect(res.errors.length).toBe(2);
  });
});

// ── Editor/Drift shape ────────────────────────────────────────

describe("workflow surgery on editor-format graphs", () => {
  it("swaps email to SMS", () => {
    const g = driftGraph();
    const res = applyWorkflowSurgery(g, [
      { op: "change_type", node: "email", new_type: "send_sms", config: { to_phone: "+12165551234", body: "digest" } },
    ]);
    expect(res.errors).toEqual([]);
    const node = g.nodes.find((n) => n.id === "email")!;
    expect(node.type).toBe("send_sms");
    expect(node.data!.step!.type).toBe("send_sms");
    expect(node.data!.step!.config).toEqual({ to_phone: "+12165551234", body: "digest" });
    expect(g.edges.length).toBe(1); // wiring untouched
  });

  it("adds and removes nodes with edge healing", () => {
    const g = driftGraph();
    applyWorkflowSurgery(g, [
      { op: "add_node", type: "send_sms", name: "Text Too", config: { to_phone: "+1", body: "b" }, connect_from: "email" },
    ]);
    expect(g.nodes.length).toBe(3);
    expect(g.edges.some((e) => e.source === "email")).toBe(true);

    const res = applyWorkflowSurgery(g, [{ op: "remove_node", node: "email" }]);
    expect(res.errors).toEqual([]);
    // trigger now connects to the added node (healed through the removed one)
    const added = g.nodes.find((n) => n.data?.step?.name === "Text Too")!;
    expect(g.edges.some((e) => e.source === "trigger" && e.target === added.id)).toBe(true);
  });

  it("merges config patches", () => {
    const g = driftGraph();
    const res = applyWorkflowSurgery(g, [
      { op: "set_config", node: "email", config_patch: { to: "other@x.com" } },
    ]);
    expect(res.errors).toEqual([]);
    expect(g.nodes[1].data!.step!.config).toMatchObject({ to: "other@x.com", subject: "s" });
  });
});
