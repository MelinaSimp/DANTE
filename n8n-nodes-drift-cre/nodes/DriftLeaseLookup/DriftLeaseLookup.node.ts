import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftLeaseLookup implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Lease Lookup",
    name: "driftLeaseLookup",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description: "Search lease abstractions by tenant, expiry date, or terms in a Drift CRE workspace",
    defaults: {
      name: "Lease Lookup",
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
        displayName: "Status",
        name: "status",
        type: "options",
        options: [
          { name: "Completed", value: "completed" },
          { name: "Processing", value: "processing" },
          { name: "Failed", value: "failed" },
          { name: "All", value: "" },
        ],
        default: "completed",
        description: "Filter by abstraction status",
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 100 },
        default: 10,
        description: "Maximum number of lease abstractions to return",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("driftCreApi");
    const supabaseUrl = credentials.supabaseUrl as string;
    const supabaseKey = credentials.supabaseKey as string;
    const workspaceId = credentials.workspaceId as string;

    const status = this.getNodeParameter("status", 0, "completed") as string;
    const limit = this.getNodeParameter("limit", 0, 10) as number;

    const params = new URLSearchParams();
    params.set("select", "*");
    params.set("workspace_id", `eq.${workspaceId}`);
    params.set("limit", String(limit));
    params.set("order", "created_at.desc");

    if (status) {
      params.set("status", `eq.${status}`);
    }

    const response = await this.helpers.httpRequest({
      method: "GET",
      url: `${supabaseUrl}/rest/v1/lease_abstracts?${params.toString()}`,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const abstractions = Array.isArray(response) ? response : [];
    return [abstractions.map((a: Record<string, unknown>) => ({ json: a as IDataObject }))];
  }
}
