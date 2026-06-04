import Dagre from "@dagrejs/dagre";
import type { Node as RFNode, Edge as RFEdge } from "@xyflow/react";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 160;

export function autoLayout<T extends RFNode>(
  nodes: T[],
  edges: RFEdge[],
  direction: "TB" | "LR" = "TB",
): T[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 80, ranksep: 120 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  Dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    } as T;
  });
}
