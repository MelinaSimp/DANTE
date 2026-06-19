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
    const supabaseKey = credentials.supabaseKey as string;
    const workspaceId = credentials.workspaceId as string;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";

    const items = this.getInputData();
    const out: INodeExecutionData[] = [];
    const runFor = Math.max(items.length, 1);

    for (let i = 0; i < runFor; i++) {
      const title = this.getNodeParameter("title", i, "") as string;
      const subtitle = this.getNodeParameter("subtitle", i, "") as string;
      const sectionsRaw = this.getNodeParameter("sections", i, "[]") as string;

      let sections: Array<{ heading: string; body: string }>;
      try {
        sections = typeof sectionsRaw === "string" ? JSON.parse(sectionsRaw) : sectionsRaw;
      } catch {
        sections = [{ heading: "Content", body: String(sectionsRaw) }];
      }

      if (!title) {
        out.push({ json: { error: "title is required" } });
        continue;
      }

      try {
        const response = await this.helpers.httpRequest({
          method: "POST",
          url: `${appUrl}/api/documents/generate`,
          timeout: 60000,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            "x-drift-workspace-id": workspaceId,
          },
          body: { title, subtitle, sections },
          json: true,
        });

        const base64 = (response?.base64 as string) || "";
        const filename = (response?.filename as string) || "document.pdf";

        const item: INodeExecutionData = {
          json: { generated: !!base64, title, filename, bytes: response?.bytes ?? 0 },
        };

        // Re-emit the PDF as n8n binary so downstream nodes (email,
        // write-to-disk, upload) can consume it directly.
        if (base64) {
          item.binary = {
            data: await this.helpers.prepareBinaryData(
              Buffer.from(base64, "base64"),
              filename,
              "application/pdf",
            ),
          };
        }

        out.push(item);
      } catch (err) {
        out.push({ json: { error: err instanceof Error ? err.message : String(err), title } });
      }
    }

    return [out];
  }
}
