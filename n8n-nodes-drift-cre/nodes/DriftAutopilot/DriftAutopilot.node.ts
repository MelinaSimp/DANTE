import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftAutopilot implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Autopilot Analyses",
    name: "driftAutopilot",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description: "Read the autonomous pipeline's document analyses (auto-underwrites, classifications) in a Drift CRE workspace",
    defaults: {
      name: "Autopilot Analyses",
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
          { name: "Pending", value: "pending" },
          { name: "Approved", value: "approved" },
          { name: "Dismissed", value: "dismissed" },
          { name: "All", value: "" },
        ],
        default: "pending",
        description: "Filter analyses by review status",
      },
      {
        displayName: "Document Type",
        name: "docType",
        type: "options",
        options: [
          { name: "Any", value: "" },
          { name: "Rent Roll", value: "rent_roll" },
          { name: "Lease", value: "lease" },
          { name: "Operating Statement", value: "operating_statement" },
          { name: "Offering Memo", value: "offering_memo" },
        ],
        default: "",
        description: "Filter analyses by detected document type",
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 200 },
        default: 25,
        description: "Maximum number of analyses to return",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("driftCreApi");
    const supabaseUrl = credentials.supabaseUrl as string;
    const supabaseKey = credentials.supabaseKey as string;
    const workspaceId = credentials.workspaceId as string;

    const status = this.getNodeParameter("status", 0, "pending") as string;
    const docType = this.getNodeParameter("docType", 0, "") as string;
    const limit = this.getNodeParameter("limit", 0, 25) as number;

    const params = new URLSearchParams();
    params.set("select", "id,vault_item_id,doc_type,status,title,headline,confidence,summary,created_at");
    params.set("workspace_id", `eq.${workspaceId}`);
    params.set("order", "created_at.desc");
    params.set("limit", String(limit));
    if (status) params.set("status", `eq.${status}`);
    if (docType) params.set("doc_type", `eq.${docType}`);

    const response = await this.helpers.httpRequest({
      method: "GET",
      url: `${supabaseUrl}/rest/v1/dante_document_analyses?${params.toString()}`,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const analyses = Array.isArray(response) ? response : [];
    return [analyses.map((a: Record<string, unknown>) => ({ json: a as IDataObject }))];
  }
}
