import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftLeaseAbstractor implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Lease Abstractor",
    name: "driftLeaseAbstractor",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description: "Run AI lease abstraction on a vault document and return the extracted deal terms, financials, and key clauses",
    defaults: {
      name: "Lease Abstractor",
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
        displayName: "Vault Item ID",
        name: "vaultItemId",
        type: "string",
        default: "",
        required: true,
        placeholder: "={{ $json.vault_item_id }}",
        description: "ID of the vault document (lease) to abstract. It must already be ingested.",
      },
      {
        displayName: "Optimize Prompt",
        name: "refinePrompt",
        type: "boolean",
        default: false,
        description: "Whether to tailor the extraction to this lease's terminology (extra AI pass)",
      },
      {
        displayName: "Market Context",
        name: "webSearch",
        type: "boolean",
        default: false,
        description: "Whether to research the property/tenant for market context (extra AI pass)",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("driftCreApi");
    const supabaseKey = credentials.supabaseKey as string;
    const workspaceId = credentials.workspaceId as string;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";

    const items = this.getInputData();
    const out: INodeExecutionData[] = [];
    const runFor = Math.max(items.length, 1);

    for (let i = 0; i < runFor; i++) {
      const vaultItemId = this.getNodeParameter("vaultItemId", i, "") as string;
      const refinePrompt = this.getNodeParameter("refinePrompt", i, false) as boolean;
      const webSearch = this.getNodeParameter("webSearch", i, false) as boolean;

      if (!vaultItemId) {
        out.push({ json: { error: "vaultItemId is required" } });
        continue;
      }

      const response = await this.helpers.httpRequest({
        method: "POST",
        url: `${appUrl}/api/lease-abstractor`,
        // Match the API route's maxDuration (800s) — real abstractions on
        // long leases run 5-10 minutes; 290s cut them off mid-pass.
        timeout: 810000,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          "x-drift-workspace-id": workspaceId,
        },
        body: {
          vault_item_id: vaultItemId,
          options: { refinePrompt: refinePrompt || undefined, webSearch: webSearch || undefined },
        },
        json: true,
      });

      out.push({ json: (response ?? {}) as IDataObject });
    }

    return [out];
  }
}
