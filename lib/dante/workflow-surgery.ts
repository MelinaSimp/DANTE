// lib/dante/workflow-surgery.ts
//
// Structural workflow editing for Dante's workflow.update tool: change
// a node's type (email → SMS), add nodes, remove nodes (healing the
// connections around them), and patch config on either graph format.
//
// Two graph shapes exist in dante_workflows.graph:
//   A. n8n-native:   { nodes: [{id, name, type, parameters, ...}],
//                      connections: { "<Node Name>": { main: [[{node}]] } } }
//      (hand-crafted template clones; connections are keyed by NAME)
//   B. editor/Drift: { nodes: [{id, type, position, data: { step }}],
//                      edges: [{source, target}] }
//      (canvas saves, legacy templates; edges are keyed by node ID)
//
// All operations mutate the graph in place and return a human-readable
// change list plus per-op errors. Callers persist + re-sync to n8n.

import { DRIFT_TO_N8N_NODE_TYPE } from "./n8n-types";
import { convertParameters, getTypeVersion } from "./n8n-converter";

// ── Types ─────────────────────────────────────────────────────

export type StructuralOp =
  | {
      op: "change_type";
      /** Node id or display name. */
      node: string;
      /** Drift step type to become (send_sms, send_email, agent, ...). */
      new_type: string;
      /** COMPLETE config for the new node type (e.g. {to_phone, body}).
       *  The old node's config does not carry over — different types
       *  have different fields. */
      config: Record<string, unknown>;
      new_name?: string;
    }
  | {
      op: "add_node";
      type: string;
      name: string;
      config?: Record<string, unknown>;
      /** Wire an edge from this existing node (id or name). */
      connect_from?: string;
      /** Wire an edge to this existing node (id or name). */
      connect_to?: string;
    }
  | {
      op: "remove_node";
      node: string;
      }
  | {
      op: "set_config";
      node: string;
      config_patch: Record<string, unknown>;
    };

export interface SurgeryResult {
  changed: string[];
  errors: string[];
}

// ── Shape detection ───────────────────────────────────────────

type AnyGraph = Record<string, unknown>;
type N8nNode = {
  id: string;
  name: string;
  type: string;
  typeVersion?: number;
  position?: number[];
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
};
type DriftNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: { step?: { id: string; type: string; name?: string; config?: Record<string, unknown> } };
};
type Connections = Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;

export function isN8nNativeGraph(graph: AnyGraph): boolean {
  return !!graph.connections || (Array.isArray(graph.nodes) && !Array.isArray(graph.edges));
}

const DRIFT_CRE_PREFIX = "n8n-nodes-drift-cre.";

function isKnownDriftType(t: string): boolean {
  return t in DRIFT_TO_N8N_NODE_TYPE;
}

/** Build a fresh n8n node from a Drift step type + config. */
function buildN8nNode(
  id: string,
  name: string,
  driftType: string,
  config: Record<string, unknown>,
  position: number[],
): N8nNode {
  const n8nType = DRIFT_TO_N8N_NODE_TYPE[driftType];
  if (!n8nType) throw new Error(`Unknown step type: ${driftType}`);
  const node: N8nNode = {
    id,
    name,
    type: n8nType,
    typeVersion: getTypeVersion(n8nType),
    position,
    parameters: convertParameters(driftType, config, id),
  };
  if (n8nType.startsWith(DRIFT_CRE_PREFIX)) {
    // Placeholder — patchGraphCredentialsForWorkspace resolves the real
    // workspace credential at push time.
    node.credentials = { driftCreApi: { id: "1", name: "Drift CRE" } };
  }
  return node;
}

// ── Shape A: n8n-native ───────────────────────────────────────

function findN8nNode(nodes: N8nNode[], ref: string): N8nNode | undefined {
  return nodes.find((n) => n.id === ref || n.name === ref);
}

function renameInConnections(connections: Connections, oldName: string, newName: string): void {
  if (connections[oldName]) {
    connections[newName] = connections[oldName];
    delete connections[oldName];
  }
  for (const entry of Object.values(connections)) {
    for (const outputs of entry.main || []) {
      for (const c of outputs || []) {
        if (c.node === oldName) c.node = newName;
      }
    }
  }
}

function applyToN8nGraph(graph: AnyGraph, ops: StructuralOp[]): SurgeryResult {
  const nodes = graph.nodes as N8nNode[];
  const connections = (graph.connections ?? {}) as Connections;
  graph.connections = connections;
  const changed: string[] = [];
  const errors: string[] = [];

  for (const op of ops) {
    try {
      switch (op.op) {
        case "change_type": {
          const node = findN8nNode(nodes, op.node);
          if (!node) throw new Error(`node "${op.node}" not found`);
          if (!isKnownDriftType(op.new_type)) throw new Error(`unknown step type "${op.new_type}"`);
          const name = op.new_name || node.name;
          const fresh = buildN8nNode(node.id, name, op.new_type, op.config || {}, node.position || [80, 80]);
          if (name !== node.name) renameInConnections(connections, node.name, name);
          const idx = nodes.indexOf(node);
          nodes[idx] = fresh;
          changed.push(`"${node.name}" → ${op.new_type}${op.new_name ? ` (renamed "${name}")` : ""}`);
          break;
        }
        case "add_node": {
          if (!isKnownDriftType(op.type)) throw new Error(`unknown step type "${op.type}"`);
          if (findN8nNode(nodes, op.name)) throw new Error(`a node named "${op.name}" already exists`);
          const from = op.connect_from ? findN8nNode(nodes, op.connect_from) : undefined;
          if (op.connect_from && !from) throw new Error(`connect_from "${op.connect_from}" not found`);
          const to = op.connect_to ? findN8nNode(nodes, op.connect_to) : undefined;
          if (op.connect_to && !to) throw new Error(`connect_to "${op.connect_to}" not found`);
          const anchor = from || nodes[nodes.length - 1];
          const pos = [(anchor?.position?.[0] ?? 80) + 220, anchor?.position?.[1] ?? 80];
          const id = `node-${nodes.length + 1}-${op.type}`;
          nodes.push(buildN8nNode(id, op.name, op.type, op.config || {}, pos));
          if (from) {
            const entry = (connections[from.name] ||= { main: [[]] });
            (entry.main[0] ||= []).push({ node: op.name, type: "main", index: 0 });
          }
          if (to) {
            connections[op.name] = { main: [[{ node: to.name, type: "main", index: 0 }]] };
          }
          changed.push(`added "${op.name}" (${op.type})`);
          break;
        }
        case "remove_node": {
          const node = findN8nNode(nodes, op.node);
          if (!node) throw new Error(`node "${op.node}" not found`);
          // Heal: everything pointing at the removed node now points at
          // the removed node's own targets.
          const targets = (connections[node.name]?.main?.[0] || []).map((c) => ({ ...c }));
          for (const [srcName, entry] of Object.entries(connections)) {
            if (srcName === node.name) continue;
            for (let o = 0; o < (entry.main || []).length; o++) {
              const outputs = entry.main[o] || [];
              if (outputs.some((c) => c.node === node.name)) {
                entry.main[o] = outputs
                  .filter((c) => c.node !== node.name)
                  .concat(targets.filter((t) => !outputs.some((c) => c.node === t.node)));
              }
            }
          }
          delete connections[node.name];
          nodes.splice(nodes.indexOf(node), 1);
          changed.push(`removed "${node.name}"`);
          break;
        }
        case "set_config": {
          const node = findN8nNode(nodes, op.node);
          if (!node) throw new Error(`node "${op.node}" not found`);
          if (node.type.startsWith(DRIFT_CRE_PREFIX)) {
            // Drift CRE nodes carry flat parameters whose names come from
            // convertParameters — regenerate from the drift-type mapping
            // so template-style keys (vault_item_id) translate correctly.
            const driftType = Object.entries(DRIFT_TO_N8N_NODE_TYPE).find(([, v]) => v === node.type)?.[0];
            if (driftType) {
              node.parameters = {
                ...node.parameters,
                ...convertParameters(driftType, op.config_patch, node.id),
              };
            } else {
              node.parameters = { ...node.parameters, ...op.config_patch };
            }
          } else if (
            node.type === "n8n-nodes-base.httpRequest" &&
            typeof node.parameters?.url === "string" &&
            (node.parameters.url.includes("api.resend.com") || node.parameters.url.includes("/api/sms/workflow-send"))
          ) {
            // Email/SMS delivery nodes bake their fields into a composed
            // jsonBody — a raw key merge can't reach them. Rebuild the
            // whole parameter set; the patch must carry the complete
            // field set for the channel.
            const isSms = node.parameters.url.includes("/api/sms/workflow-send");
            const required = isSms ? ["to_phone", "body"] : ["to", "subject", "text"];
            const missing = required.filter((k) => !(k in op.config_patch));
            if (missing.length > 0) {
              throw new Error(
                `editing a ${isSms ? "SMS" : "email"} node needs the complete config (missing: ${missing.join(", ")}). ` +
                `Include all of: ${required.join(", ")}.`,
              );
            }
            node.parameters = convertParameters(isSms ? "send_sms" : "send_email", op.config_patch, node.id);
          } else {
            node.parameters = { ...node.parameters, ...op.config_patch };
          }
          changed.push(`"${node.name}" config updated`);
          break;
        }
      }
    } catch (err) {
      errors.push(`${op.op}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { changed, errors };
}

// ── Shape B: editor/Drift graph ───────────────────────────────

function findDriftNode(nodes: DriftNode[], ref: string): DriftNode | undefined {
  return nodes.find((n) => n.id === ref || n.data?.step?.name === ref);
}

function applyToDriftGraph(graph: AnyGraph, ops: StructuralOp[]): SurgeryResult {
  const nodes = graph.nodes as DriftNode[];
  const edges = (graph.edges ?? []) as Array<{ id?: string; source: string; target: string }>;
  graph.edges = edges;
  const changed: string[] = [];
  const errors: string[] = [];

  for (const op of ops) {
    try {
      switch (op.op) {
        case "change_type": {
          const node = findDriftNode(nodes, op.node);
          if (!node?.data?.step) throw new Error(`node "${op.node}" not found`);
          if (!isKnownDriftType(op.new_type)) throw new Error(`unknown step type "${op.new_type}"`);
          const oldName = node.data.step.name || node.id;
          node.type = op.new_type;
          node.data.step.type = op.new_type;
          node.data.step.config = { ...(op.config || {}) };
          if (op.new_name) node.data.step.name = op.new_name;
          changed.push(`"${oldName}" → ${op.new_type}`);
          break;
        }
        case "add_node": {
          if (!isKnownDriftType(op.type)) throw new Error(`unknown step type "${op.type}"`);
          const from = op.connect_from ? findDriftNode(nodes, op.connect_from) : undefined;
          if (op.connect_from && !from) throw new Error(`connect_from "${op.connect_from}" not found`);
          const to = op.connect_to ? findDriftNode(nodes, op.connect_to) : undefined;
          if (op.connect_to && !to) throw new Error(`connect_to "${op.connect_to}" not found`);
          const id = `node-${nodes.length + 1}-${op.type}`;
          const anchor = from || nodes[nodes.length - 1];
          nodes.push({
            id,
            type: op.type,
            position: { x: anchor?.position?.x ?? 80, y: (anchor?.position?.y ?? 80) + 150 },
            data: { step: { id, type: op.type, name: op.name, config: { ...(op.config || {}) } } },
          });
          if (from) edges.push({ id: `e-${from.id}-${id}`, source: from.id, target: id });
          if (to) edges.push({ id: `e-${id}-${to.id}`, source: id, target: to.id });
          changed.push(`added "${op.name}" (${op.type})`);
          break;
        }
        case "remove_node": {
          const node = findDriftNode(nodes, op.node);
          if (!node) throw new Error(`node "${op.node}" not found`);
          const incoming = edges.filter((e) => e.target === node.id);
          const outgoing = edges.filter((e) => e.source === node.id);
          // Heal around the removed node.
          for (const inc of incoming) {
            for (const out of outgoing) {
              if (!edges.some((e) => e.source === inc.source && e.target === out.target)) {
                edges.push({ id: `e-${inc.source}-${out.target}`, source: inc.source, target: out.target });
              }
            }
          }
          graph.edges = edges.filter((e) => e.source !== node.id && e.target !== node.id);
          nodes.splice(nodes.indexOf(node), 1);
          changed.push(`removed "${node.data?.step?.name || node.id}"`);
          break;
        }
        case "set_config": {
          const node = findDriftNode(nodes, op.node);
          if (!node?.data?.step) throw new Error(`node "${op.node}" not found`);
          node.data.step.config = { ...(node.data.step.config || {}), ...op.config_patch };
          changed.push(`"${node.data.step.name || node.id}" config updated`);
          break;
        }
      }
    } catch (err) {
      errors.push(`${op.op}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { changed, errors };
}

// ── Entry point ───────────────────────────────────────────────

export function applyWorkflowSurgery(graph: AnyGraph, ops: StructuralOp[]): SurgeryResult {
  if (!Array.isArray(graph.nodes)) return { changed: [], errors: ["workflow has no graph nodes"] };
  return isN8nNativeGraph(graph) ? applyToN8nGraph(graph, ops) : applyToDriftGraph(graph, ops);
}
