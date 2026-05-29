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
//
// Voicemail nodes can carry routing metadata (label, sms_to, email_to)
// so different call categories — property management vs accounting vs
// general — can land in different inboxes. The compiler bakes those
// values into the tool-call instruction so the LLM passes them through
// to send_to_voicemail; the webhook persists them and the end-of-call
// dispatcher uses them to decide where to send the transcript.

export type ScenarioNode =
  | { id: string; type: "say"; text: string }
  | {
      id: string;
      type: "branch";
      prompt: string;
      branches: Array<{ match: string; next: string }>;
      default?: string | null;
    }
  | {
      id: string;
      type: "voicemail";
      prompt?: string;
      label?: string;
      sms_to?: string;
      email_to?: string;
      /** Per-step "live transfer to a human" window. When the LLM
       *  reaches this voicemail step AND current time is inside one of
       *  these windows, the webhook returns a transfer destination
       *  instead of arming voicemail recording. Outside the windows
       *  (or when null), the step behaves like a regular voicemail. */
      human_hours?: {
        timezone?: string;
        windows: Partial<
          Record<
            "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat",
            Array<{ start: string; end: string }>
          >
        >;
      } | null;
      /** E.164 number to bridge to during human_hours. Empty / missing
       *  means human_hours is ignored even if set. */
      human_transfer_to?: string;
    }
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

// Match strings can carry comma-separated synonyms — "property
// management, PM, tenant, rent" — so a single branch row covers all
// the ways a caller might phrase the same intent without the script
// author needing one row per synonym. Empty entries are dropped.
function splitMatchSynonyms(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function escapeForPrompt(s: string): string {
  // The prompt embeds these inside double-quoted strings. Strip stray
  // quote chars that would break the surrounding quoting; we don't need
  // to do anything fancier — these are short labels/numbers.
  return (s || "").replace(/"/g, "'").trim();
}

export interface ScenarioPromptOptions {
  /**
   * When true, the entry node is omitted from the rendered script.
   * Used when the entry is a "say" whose text has already been hoisted
   * to VAPI's firstMessage — without this flag the LLM would see the
   * greeting in the script and try to repeat it on its first turn.
   */
  skipEntryNode?: boolean;
  /**
   * When true, the entry node is a branch whose `prompt` has been
   * hoisted to firstMessage. We KEEP the branch in the script (the
   * routing rules are essential for the LLM's first decision) but
   * render it as "the caller has just been asked …" so the LLM knows
   * the question is already on the wire and the next turn is the
   * caller's answer — not the LLM re-asking.
   */
  entryAlreadyAsked?: boolean;
}

export function scenarioToSystemPrompt(
  scenario: Scenario,
  agentName: string,
  opts: ScenarioPromptOptions = {},
): string {
  const nodes = scenario.nodes || [];
  if (nodes.length === 0) {
    return `You are ${agentName}. The user has selected scenario mode but hasn't built any steps yet — politely tell the caller you'll be ready shortly.`;
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const lines: string[] = [];

  // If we hoisted the entry "say" to firstMessage, mark it visited
  // up front so neither visit(entry) nor the orphan-walk renders it.
  // Branches that point back at the entry would now resolve to
  // "(unknown step)" — that's a niche shape we accept for v1.
  if (opts.skipEntryNode && scenario.entry) {
    visited.add(scenario.entry);
  }

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
        if (opts.entryAlreadyAsked && node.id === scenario.entry) {
          // Entry-branch hoisting: VAPI plays the prompt as firstMessage,
          // the caller is responding to it right now. The LLM's first
          // turn is the routing decision, not re-asking the question.
          lines.push(
            `Step ${stepNo} — the caller has just been asked at call connect: "${node.prompt}". They are responding to that question now. Route based on what they say:`
          );
        } else {
          lines.push(`Step ${stepNo} (ask): "${node.prompt}"`);
        }
        for (const b of node.branches) {
          const synonyms = splitMatchSynonyms(b.match);
          if (synonyms.length === 0) continue;
          if (synonyms.length === 1) {
            lines.push(`  • If the caller's answer matches "${synonyms[0]}", go to Step ↦ ${b.next}`);
          } else {
            const list = synonyms.map((s) => `"${s}"`).join(", ");
            lines.push(`  • If the caller's answer mentions any of: ${list} (or close synonyms), go to Step ↦ ${b.next}`);
          }
        }
        if (node.default) {
          lines.push(`  • Otherwise go to Step ↦ ${node.default}`);
        }
        break;
      case "voicemail": {
        const greeting = escapeForPrompt(node.prompt || "Please leave a message after the tone.");
        // Build the tool-call argument string. Always pass `greeting`;
        // pass the routing metadata only when present so the JSON the
        // model emits stays minimal for nodes that don't need it.
        const args: string[] = [`greeting="${greeting}"`];
        if (node.label) args.push(`label="${escapeForPrompt(node.label)}"`);
        if (node.sms_to) args.push(`sms_to="${escapeForPrompt(node.sms_to)}"`);
        if (node.email_to) args.push(`email_to="${escapeForPrompt(node.email_to)}"`);
        // Per-step "live transfer during certain hours" — when these
        // are present, the webhook does a server-side time check at
        // tool-call time and either returns a transfer destination
        // (VAPI bridges the call to a human) or proceeds with normal
        // voicemail recording. The LLM doesn't reason about time — it
        // just passes the args through verbatim.
        if (node.human_hours && node.human_transfer_to) {
          args.push(`human_hours=${JSON.stringify(JSON.stringify(node.human_hours))}`);
          args.push(`human_transfer_to="${escapeForPrompt(node.human_transfer_to)}"`);
        }
        // Tool-call FIRST, then the spoken greeting. gpt-4o-mini
        // sometimes skips a "say X, then call the tool" instruction —
        // it speaks and forgets the tool. Putting the tool first is a
        // stronger forcing function: the model can't just talk past it.
        lines.push(
          `Step ${stepNo} (voicemail): YOU MUST FIRST call the send_to_voicemail tool with ${args.join(", ")} — do not skip this step. The tool's response will either confirm voicemail mode OR perform a live transfer (during human hours). If it confirms voicemail mode, say "${greeting}" and stay quiet so the caller can record. If it performs a transfer, the tool itself handles the bridge — say nothing further.`
        );
        break;
      }
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
- send_to_voicemail(greeting, label?, sms_to?, email_to?): activates voicemail mode. CRITICAL: when a voicemail step says to call this tool, you MUST actually invoke the tool — speaking the greeting alone is not enough. The tool stamps the routing metadata on the call so the right person receives the transcript afterward. Always invoke the tool BEFORE speaking the greeting. Pass every argument shown in the voicemail step verbatim. After invoking, speak the greeting, then stay quiet while the caller records.`;

  return `${header}\n\n${resolved.join("\n")}\n${tools}`;
}
