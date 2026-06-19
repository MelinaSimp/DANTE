import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftUnderwriter implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Underwriter",
    name: "driftUnderwriter",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description: "Run a DCF underwriting model on a rent-roll spreadsheet in the vault. Returns indicated value, NOI, implied cap, and (with a purchase price) IRR and equity multiple.",
    defaults: {
      name: "Underwriter",
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
        description: "ID of the rent-roll spreadsheet (xlsx/csv) in the vault to underwrite",
      },
      {
        displayName: "Purchase Price",
        name: "purchasePrice",
        type: "number",
        default: 0,
        description: "Optional. When > 0, the model adds returns analysis (IRR, cash-on-cash, equity multiple).",
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
      const purchasePrice = this.getNodeParameter("purchasePrice", i, 0) as number;

      if (!vaultItemId) {
        out.push({ json: { error: "vaultItemId is required" } });
        continue;
      }

      const body: IDataObject = { vaultItemId };
      if (purchasePrice && purchasePrice > 0) body.purchasePrice = purchasePrice;

      const response = await this.helpers.httpRequest({
        method: "POST",
        url: `${appUrl}/api/underwrite/summary`,
        timeout: 60000,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          "x-drift-workspace-id": workspaceId,
        },
        body,
        json: true,
      });

      out.push({ json: (response ?? {}) as IDataObject });
    }

    return [out];
  }
}
