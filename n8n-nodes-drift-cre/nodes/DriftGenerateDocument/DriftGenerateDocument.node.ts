import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftGenerateDocument implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Generate Document",
    name: "driftGenerateDocument",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description: "Generate a branded PDF document from structured sections",
    defaults: {
      name: "Generate Document",
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
        displayName: "Title",
        name: "title",
        type: "string",
        default: "",
        required: true,
        description: "Document title",
      },
      {
        displayName: "Subtitle",
        name: "subtitle",
        type: "string",
        default: "",
        description: "Document subtitle (optional)",
      },
      {
        displayName: "Sections",
        name: "sections",
        type: "json",
        default: "[]",
        required: true,
        description: 'JSON array of sections: [{"heading": "...", "body": "..."}, ...]',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("driftCreApi");
    const supabaseUrl = credentials.supabaseUrl as string;
    const supabaseKey = credentials.supabaseKey as string;
    const workspaceId = credentials.workspaceId as string;

    const title = this.getNodeParameter("title", 0, "") as string;
    const subtitle = this.getNodeParameter("subtitle", 0, "") as string;
    const sectionsRaw = this.getNodeParameter("sections", 0, "[]") as string;

    let sections: Array<{ heading: string; body: string }>;
    try {
      sections = typeof sectionsRaw === "string" ? JSON.parse(sectionsRaw) : sectionsRaw;
    } catch {
      sections = [{ heading: "Content", body: String(sectionsRaw) }];
    }

    if (!title) {
      return [[{ json: { error: "title is required" } }]];
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";

    try {
      const response = await this.helpers.httpRequest({
        method: "POST",
        url: `${appUrl}/api/dante/export`,
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: {
          workspace_id: workspaceId,
          title,
          subtitle,
          sections,
          format: "pdf",
        },
      });

      return [[{
        json: {
          generated: true,
          title,
          url: response?.url || null,
          filename: response?.filename || `${title.replace(/\s+/g, "-").toLowerCase()}.pdf`,
        },
      }]];
    } catch (err) {
      return [[{
        json: {
          error: err instanceof Error ? err.message : String(err),
          title,
        },
      }]];
    }
  }
}
