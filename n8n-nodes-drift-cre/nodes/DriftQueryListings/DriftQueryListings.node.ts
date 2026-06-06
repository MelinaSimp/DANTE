import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftQueryListings implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Query Listings",
    name: "driftQueryListings",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description: "Query active commercial listings from a Drift CRE workspace",
    defaults: {
      name: "Query Listings",
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
        displayName: "Filter Field",
        name: "filterField",
        type: "string",
        default: "status",
        placeholder: "e.g. status, property_type, city",
        description: "Column name to filter by. Status: active, pending, sold, expired, withdrawn.",
      },
      {
        displayName: "Filter Value",
        name: "filterValue",
        type: "string",
        default: "active",
        description: "Value to match against the filter field",
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 250 },
        default: 25,
        description: "Maximum number of listings to return",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("driftCreApi");
    const supabaseUrl = credentials.supabaseUrl as string;
    const supabaseKey = credentials.supabaseKey as string;
    const workspaceId = credentials.workspaceId as string;

    const filterField = this.getNodeParameter("filterField", 0, "status") as string;
    const filterValue = this.getNodeParameter("filterValue", 0, "active") as string;
    const limit = this.getNodeParameter("limit", 0, 25) as number;

    const params = new URLSearchParams();
    params.set("select", "*");
    params.set("workspace_id", `eq.${workspaceId}`);
    params.set("limit", String(limit));
    params.set("order", "created_at.desc");

    if (filterField && filterValue) {
      params.set(filterField, `eq.${filterValue}`);
    }

    const response = await this.helpers.httpRequest({
      method: "GET",
      url: `${supabaseUrl}/rest/v1/listings?${params.toString()}`,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const listings = Array.isArray(response) ? response : [];
    return [listings.map((l: Record<string, unknown>) => ({ json: l }))];
  }
}
