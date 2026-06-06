import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftUpdateContact implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Update Contact",
    name: "driftUpdateContact",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description: "Update a contact record in the Drift CRE workspace",
    defaults: {
      name: "Update Contact",
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
        displayName: "Contact ID",
        name: "contactId",
        type: "string",
        default: "",
        required: true,
        description: "The ID of the contact to update (use expressions to reference upstream data)",
      },
      {
        displayName: "Update Fields",
        name: "updateFields",
        type: "json",
        default: "{}",
        description: "JSON object of fields to update (e.g. { \"notes\": \"Updated by workflow\", \"status\": \"active\" })",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("driftCreApi");
    const supabaseUrl = credentials.supabaseUrl as string;
    const supabaseKey = credentials.supabaseKey as string;
    const workspaceId = credentials.workspaceId as string;

    const items = this.getInputData();
    const results: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const contactId = this.getNodeParameter("contactId", i, "") as string;
      const updateFieldsRaw = this.getNodeParameter("updateFields", i, "{}") as string;

      let updateFields: Record<string, unknown>;
      try {
        updateFields = typeof updateFieldsRaw === "string"
          ? JSON.parse(updateFieldsRaw)
          : updateFieldsRaw;
      } catch {
        updateFields = {};
      }

      if (!contactId) {
        results.push({ json: { error: "contactId is required", index: i } });
        continue;
      }

      // Ensure we only update within the workspace
      const response = await this.helpers.httpRequest({
        method: "PATCH",
        url: `${supabaseUrl}/rest/v1/contacts?id=eq.${contactId}&workspace_id=eq.${workspaceId}`,
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: {
          ...updateFields,
          updated_at: new Date().toISOString(),
        },
      });

      const updated = Array.isArray(response) ? response[0] : response;
      results.push({ json: { updated: true, contact: updated || { id: contactId } } });
    }

    return [results];
  }
}
