import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftQueryProperties implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Query Properties",
    name: "driftQueryProperties",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description: "Query properties from a Drift CRE workspace pipeline with optional filters",
    defaults: {
      name: "Query Properties",
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
        default: "",
        placeholder: "e.g. transaction_stage, kind, city",
        description: "Column name to filter by. transaction_stage values: listed, showing, offer, pending, closed, withdrawn, expired.",
      },
      {
        displayName: "Filter Value",
        name: "filterValue",
        type: "string",
        default: "",
        description: "Value to match against the filter field",
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 500 },
        default: 50,
        description: "Maximum number of properties to return",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("driftCreApi");
    const supabaseUrl = credentials.supabaseUrl as string;
    const supabaseKey = credentials.supabaseKey as string;
    const workspaceId = credentials.workspaceId as string;

    const filterField = this.getNodeParameter("filterField", 0, "") as string;
    const filterValue = this.getNodeParameter("filterValue", 0, "") as string;
    const limit = this.getNodeParameter("limit", 0, 50) as number;

    const params = new URLSearchParams();
    params.set("select", "*");
    params.set("workspace_id", `eq.${workspaceId}`);
    params.set("limit", String(limit));
    params.set("order", "updated_at.desc");

    if (filterField && filterValue) {
      params.set(filterField, `eq.${filterValue}`);
    }

    const response = await this.helpers.httpRequest({
      method: "GET",
      url: `${supabaseUrl}/rest/v1/properties?${params.toString()}`,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const properties = Array.isArray(response) ? response : [];
    const items: INodeExecutionData[] = properties.map((p: Record<string, unknown>) => ({
      json: p as IDataObject,
    }));

    return [items];
  }
}
