import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftAiAgent implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: AI Agent",
    name: "driftAiAgent",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description:
      "Invoke Dante's autonomous AI reasoning loop with tool access. " +
      "Use for complex analytical tasks that require multi-step reasoning, " +
      "tool calls, and synthesis (void analysis, deal scoring, research).",
    defaults: {
      name: "AI Agent",
    },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [
      {
        name: "driftCreApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Objective",
        name: "objective",
        type: "string",
        typeOptions: { rows: 6 },
        default: "",
        required: true,
        description:
          "What the agent should accomplish. Be specific about the " +
          "data to gather, the analysis to perform, and the format of " +
          "the output. Use n8n expressions to reference upstream data " +
          "(e.g. {{ $json.address }}).",
      },
      {
        displayName: "Tools",
        name: "tools",
        type: "string",
        default: "",
        description:
          "Comma-separated list of Drift tools the agent can use. " +
          "Available: memory.search, memory.write, clients.query, " +
          "properties.query, vault.cite, web.search, " +
          "site_scan.search, site_scan.detail, site_scan.void_analysis, " +
          "survey_area, cre.calculate. Leave empty for default tools.",
      },
      {
        displayName: "Max Steps",
        name: "maxSteps",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 30 },
        default: 10,
        description: "Maximum number of reasoning/tool-call steps before the agent must conclude",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("driftCreApi");
    const supabaseUrl = credentials.supabaseUrl as string;
    const supabaseKey = credentials.supabaseKey as string;
    const workspaceId = credentials.workspaceId as string;

    const objective = this.getNodeParameter("objective", 0, "") as string;
    const toolsRaw = this.getNodeParameter("tools", 0, "") as string;
    const maxSteps = this.getNodeParameter("maxSteps", 0, 10) as number;

    if (!objective) {
      return [[{ json: { error: "objective is required" } }]];
    }

    const tools = toolsRaw
      ? toolsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : ["memory.search", "memory.write", "clients.query", "web.search"];

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";

    try {
      // Call Drift's agent API which handles the full reasoning loop.
      // simulate:false makes the service-key path actually run tools
      // rather than returning a dry-run plan.
      const response = await this.helpers.httpRequest({
        method: "POST",
        url: `${appUrl}/api/dante/agent/test`,
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: {
          workspace_id: workspaceId,
          objective,
          tools,
          max_steps: maxSteps,
          simulate: false,
        },
      });

      // The agent returns its final text output and any structured data
      const text = response?.text || response?.message || "";
      const structured = response?.structured || null;

      return [[{
        json: {
          text,
          ...(structured ? { structured } : {}),
          tools_used: response?.tools_used || [],
          steps_taken: response?.steps_taken || 0,
        },
      }]];
    } catch (err) {
      return [[{
        json: {
          error: err instanceof Error ? err.message : String(err),
          objective,
        },
      }]];
    }
  }
}
