import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftDueDiligence implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Due Diligence",
    name: "driftDueDiligence",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description: "Run consolidated due diligence checks: Census, BLS, FEMA, EPA, and Google Maps data for a property address",
    defaults: {
      name: "Due Diligence",
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
        displayName: "Address",
        name: "address",
        type: "string",
        default: "",
        required: true,
        placeholder: "1600 Euclid Ave, Cleveland, OH 44115",
        description: "Full property address for due diligence lookup",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("driftCreApi");
    const supabaseUrl = credentials.supabaseUrl as string;
    const supabaseKey = credentials.supabaseKey as string;

    const address = this.getNodeParameter("address", 0, "") as string;

    if (!address) {
      return [[{ json: { error: "address is required" } }]];
    }

    // Call Drift's site_scan.detail API which consolidates Census + BLS + FEMA + EPA + Google Maps
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";

    try {
      // Geocode the address first
      const geocodeResponse = await this.helpers.httpRequest({
        method: "POST",
        url: `${appUrl}/api/site-scan/geocode`,
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: { address },
      });

      const lat = geocodeResponse?.lat;
      const lng = geocodeResponse?.lng;

      if (!lat || !lng) {
        return [[{ json: { error: "Could not geocode address", address } }]];
      }

      // Fetch consolidated due diligence data
      const ddResponse = await this.helpers.httpRequest({
        method: "POST",
        url: `${appUrl}/api/site-scan/detail`,
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: { lat, lng, address },
      });

      return [[{
        json: {
          address,
          lat,
          lng,
          ...ddResponse,
        },
      }]];
    } catch (err) {
      // Return partial data on error rather than failing the workflow
      return [[{
        json: {
          address,
          error: err instanceof Error ? err.message : String(err),
          partial: true,
        },
      }]];
    }
  }
}
