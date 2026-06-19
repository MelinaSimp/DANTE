import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftMarketComps implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Market Comps",
    name: "driftMarketComps",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description: "Look up imported market comparables (sales) in a Drift CRE workspace, filtered by property type",
    defaults: {
      name: "Market Comps",
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
        displayName: "Property Type",
        name: "propertyType",
        type: "string",
        default: "",
        placeholder: "Retail",
        description: "Optional case-insensitive filter on the comp's property type (blank = all)",
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 500 },
        default: 50,
        description: "Maximum number of comps to return",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("driftCreApi");
    const supabaseUrl = credentials.supabaseUrl as string;
    const supabaseKey = credentials.supabaseKey as string;
    const workspaceId = credentials.workspaceId as string;

    const propertyType = (this.getNodeParameter("propertyType", 0, "") as string).trim();
    const limit = this.getNodeParameter("limit", 0, 50) as number;

    const params = new URLSearchParams();
    params.set("select", "id,source,address,city,state,property_type,sf,sale_price,price_per_sf,cap_rate,sale_date,created_at");
    params.set("workspace_id", `eq.${workspaceId}`);
    params.set("order", "created_at.desc");
    params.set("limit", String(limit));
    if (propertyType) {
      params.set("property_type", `ilike.*${propertyType}*`);
    }

    const response = await this.helpers.httpRequest({
      method: "GET",
      url: `${supabaseUrl}/rest/v1/market_comps?${params.toString()}`,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const comps = Array.isArray(response) ? response : [];

    // Roll up simple aggregates so a workflow can branch on them.
    const ppsf = comps.map((c: Record<string, unknown>) => Number(c.price_per_sf)).filter((n) => Number.isFinite(n) && n > 0);
    const caps = comps.map((c: Record<string, unknown>) => Number(c.cap_rate)).filter((n) => Number.isFinite(n) && n > 0);
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const round = (n: number | null, d: number) => (n == null ? null : Math.round(n * Math.pow(10, d)) / Math.pow(10, d));

    const summary: IDataObject = {
      count: comps.length,
      avg_price_per_sf: round(avg(ppsf), 2),
      avg_cap_rate: round(avg(caps), 4),
    };

    return [[
      { json: { summary, comps } as IDataObject },
    ]];
  }
}
