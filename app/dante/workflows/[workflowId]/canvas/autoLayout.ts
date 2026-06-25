import Dagre from "@dagrejs/dagre";
import type { Node as RFNode, Edge as RFEdge } from "@xyflow/react";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 140;

// Agent sub-nodes hang in a lane beneath their agent rather than joining
// the main left-to-right rank.
const SUB_NODE_WIDTH = 200;
const SUB_LANE_GAP = 110; // vertical gap from agent top to the sub-node row
const SUB_SPACING = 240; // horizontal spacing between sibling sub-nodes
const SUB_HANDLES = new Set(["ai_model", "ai_memory", "ai_tool"]);
const SUB_ORDER: Record<string, number> = { ai_model: 0, ai_memory: 1, ai_tool: 2 };

export function autoLayout<T extends RFNode>(
  nodes: T[],
  edges: RFEdge[],
  direction: "TB" | "LR" = "LR",
): T[] {
  // Sub-node edges feed an agent's bottom ports. Keep them — and their
  // source nodes — out of the main Dagre ranking, or Dagre would place
  // each sub-node to the left of its agent (as a predecessor) instead of
  // below it.
  const subEdges = edges.filter((e) => SUB_HANDLES.has(String(e.targetHandle ?? "")));
  const subNodeIds = new Set(subEdges.map((e) => e.source));

  const mainNodes = nodes.filter((n) => !subNodeIds.has(n.id));
  const mainEdges = edges.filter(
    (e) => !subNodeIds.has(e.source) && !subNodeIds.has(e.target),
  );

  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 80, ranksep: 130 });

  for (const node of mainNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of mainEdges) {
    g.setEdge(edge.source, edge.target);
  }

  Dagre.layout(g);

  const positioned = new Map<string, { x: number; y: number }>();
  for (const node of mainNodes) {
    const pos = g.node(node.id);
    if (pos) {
      positioned.set(node.id, { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 });
    }
  }

  // Lay each agent's sub-nodes in a row centred beneath it, ordered
  // model -> memory -> tool to line up with the bottom port lanes.
  const byAgent = new Map<string, RFEdge[]>();
  for (const e of subEdges) {
    if (!byAgent.has(e.target)) byAgent.set(e.target, []);
    byAgent.get(e.target)!.push(e);
  }
  for (const [agentId, agentSubEdges] of byAgent) {
    const agentPos = positioned.get(agentId);
    if (!agentPos) continue;
    const sorted = [...agentSubEdges].sort(
      (a, b) => (SUB_ORDER[String(a.targetHandle)] ?? 9) - (SUB_ORDER[String(b.targetHandle)] ?? 9),
    );
    const agentCenterX = agentPos.x + NODE_WIDTH / 2;
    const rowY = agentPos.y + SUB_LANE_GAP + NODE_HEIGHT;
    const totalW = (sorted.length - 1) * SUB_SPACING;
    sorted.forEach((e, i) => {
      const cx = agentCenterX - totalW / 2 + i * SUB_SPACING;
      positioned.set(e.source, { x: cx - SUB_NODE_WIDTH / 2, y: rowY });
    });
  }

  return nodes.map((node) => {
    const pos = positioned.get(node.id);
    return pos ? ({ ...node, position: pos } as T) : node;
  });
}
