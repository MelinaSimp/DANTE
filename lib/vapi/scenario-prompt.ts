// lib/vapi/scenario-prompt.ts
//
// Translate a scenario graph (JSONB on the agents row) into the
// system-prompt text VAPI feeds the LLM at call time. The richer node
// types (gather/schedule/sms) were cut for v1 — supported set is
// say / branch / voicemail / transfer.
//
// We compile the graph into a numbered "Step N → ..." script. The
// LLM is instructed to follow it deterministically and to invoke the
// transfer/voicemail tools when the script reaches those nodes.

export type ScenarioNode =
  | { id: string; type: "say"; text: string }
  | {
      id: string;
      type: "branch";
      prompt: string;
      branches: Array<{ match: string; next: string }>;
      default?: string | null;
    }
  | { id: string; type: "voicemail"; prompt?: string }
  | { id: string; type: "transfer"; to_number: string };

export interface Scenario {
  version?: number;
  entry: string | null;
  nodes: ScenarioNode[];
}

export function isScenario(value: unknown): value is Scenario {
  if (!value || typeof value !== "object") return false;
  const v = value as any;
  if (!Array.isArray(v.nodes)) return false;
  return true;
}

export function scenarioToSystemPrompt(scenario: Scenario, agentName: string): string {
  const nodes = scenario.nodes || [];
  if (nodes.length === 0) {
    return `You are ${agentName}. The user has selected scenario mode but hasn't built any steps yet — politely tell the caller you'll be ready shortly.`;
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const lines: string[] = [];

  // Walk from entry depth-first, numbering as we go. Branches are listed
  // inline ("If the caller says X → go to Step Y").
  let stepCounter = 1;
  const stepNumberById = new Map<string, number>();

  function visit(id: string | undefined | null) {
    if (!id) return;
    if (visited.has(id)) return;
    const node = byId.get(id);
    if (!node) return;
    visited.add(id);
    const stepNo = stepCounter++;
    stepNumberById.set(id, stepNo);

    switch (node.type) {
      case "say":
        lines.push(`Step ${stepNo} (say): "${node.text}"`);
        break;
      case "branch":
        lines.push(`Step ${stepNo} (ask): "${node.prompt}"`);
        for (const b of node.branches) {
          lines.push(`  • If the caller's answer matches "${b.match}", go to Step ↦ ${b.next}`);
        }
        if (node.default) {
          lines.push(`  • Otherwise go to Step ↦ ${node.default}`);
        }
        break;
      case "voicemail":
        lines.push(
          `Step ${stepNo} (voicemail): say "${node.prompt ?? "Please leave a message after the tone."}", then call the send_to_voicemail tool to record. End the conversation after.`
        );
        break;
      case "transfer":
        lines.push(
          `Step ${stepNo} (transfer): say "Connecting you now, please hold." Then call the transfer_call tool with to_number="${node.to_number}". End your participation in the call after.`
        );
        break;
    }

    // Recurse into children so they get numbered.
    if (node.type === "branch") {
      for (const b of node.branches) visit(b.next);
      if (node.default) visit(node.default);
    }
  }

  visit(scenario.entry);
  // Catch any orphans so they're still in the prompt (the LLM can fall
  // through to them if a branch points at them by id).
  for (const n of nodes) visit(n.id);

  // Now resolve the "Step ↦ <id>" placeholders into "Step <n>".
  const resolved = lines.map((l) =>
    l.replace(/Step ↦ ([\w-]+)/g, (_m, id) => {
      const n = stepNumberById.get(id);
      return n ? `Step ${n}` : `(unknown step)`;
    })
  );

  const header = `You are ${agentName}, following a deterministic call script.

Follow the steps below in order. Do not improvise around them. If the caller goes off-script, briefly bring them back to the current step. Speak naturally, one or two short sentences at a time. Never claim to be human.`;

  const tools = `
Tools available:
- transfer_call(to_number): bridges the caller to the given number. Use only when a transfer step says to.
- send_to_voicemail(): records the caller's message. Use only when a voicemail step says to.`;

  return `${header}\n\n${resolved.join("\n")}\n${tools}`;
}
