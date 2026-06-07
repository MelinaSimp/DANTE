import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftQueryContacts implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Query Contacts",
    name: "driftQueryContacts",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Query contacts from a Drift CRE workspace with optional filters",
    defaults: {
      name: "Query Contacts",
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
        placeholder: "e.g. type, status, city",
        description: "Column name to filter contacts by (leave empty for all contacts)",
      },
      {
        displayName: "Filter Value",
        name: "filterValue",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            filterField: [{ _cnd: { not: "" } }],
          },
        },
        description: "Value to match against the filter field",
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 500 },
        default: 50,
        description: "Maximum number of contacts to return",
      },
      {
        displayName: "Select Fields",
        name: "selectFields",
        type: "string",
        default: "id, name, email, phone, type, company, notes",
        description: "Comma-separated list of fields to return",
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
    const selectFields = this.getNodeParameter("selectFields", 0, "id, name, email, phone") as string;

    // Build Supabase REST query
    const params = new URLSearchParams();
    params.set("select", selectFields);
    params.set("workspace_id", `eq.${workspaceId}`);
    params.set("limit", String(limit));
    params.set("order", "name.asc");

    if (filterField && filterValue) {
      params.set(filterField, `eq.${filterValue}`);
    }

    const url = `${supabaseUrl}/rest/v1/contacts?${params.toString()}`;

    const response = await this.helpers.httpRequest({
      method: "GET",
      url,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
    });

    const contacts = Array.isArray(response) ? response : [];
    const items: INodeExecutionData[] = contacts.map((contact: Record<string, unknown>) => ({
      json: contact as IDataObject,
    }));

    return [items];
  }
}
