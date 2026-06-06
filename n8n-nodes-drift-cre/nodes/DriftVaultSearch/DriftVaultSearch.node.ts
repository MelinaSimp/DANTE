import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftVaultSearch implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Vault Search",
    name: "driftVaultSearch",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description: "Search the Drift vault (document archive) using vector + keyword search",
    defaults: {
      name: "Vault Search",
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
        displayName: "Search Query",
        name: "query",
        type: "string",
        default: "",
        required: true,
        description: "Natural language query to search the vault",
      },
      {
        displayName: "Top K Results",
        name: "topK",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 20 },
        default: 5,
        description: "Number of matching chunks to return",
      },
      {
        displayName: "Document Kind",
        name: "kind",
        type: "options",
        options: [
          { name: "All", value: "" },
          { name: "Lease", value: "lease" },
          { name: "Contract", value: "contract" },
          { name: "Appraisal", value: "appraisal" },
          { name: "Financial", value: "financial" },
          { name: "Legal", value: "legal" },
          { name: "General", value: "general" },
        ],
        default: "",
        description: "Filter by document kind (optional)",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("driftCreApi");
    const supabaseUrl = credentials.supabaseUrl as string;
    const supabaseKey = credentials.supabaseKey as string;
    const workspaceId = credentials.workspaceId as string;

    const query = this.getNodeParameter("query", 0, "") as string;
    const topK = this.getNodeParameter("topK", 0, 5) as number;
    const kind = this.getNodeParameter("kind", 0, "") as string;

    if (!query) {
      return [[{ json: { hits: [], context: "", error: "No search query provided" } }]];
    }

    // Step 1: Generate embedding for the query via OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return [[{ json: { hits: [], context: "", error: "OPENAI_API_KEY not configured" } }]];
    }

    const embeddingResponse = await this.helpers.httpRequest({
      method: "POST",
      url: "https://api.openai.com/v1/embeddings",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: {
        model: "text-embedding-3-small",
        input: query,
      },
    });

    const embedding = embeddingResponse?.data?.[0]?.embedding;
    if (!embedding) {
      return [[{ json: { hits: [], context: "", error: "Embedding generation failed" } }]];
    }

    // Step 2: RPC call to match_archive_chunks (vector search)
    const rpcBody: Record<string, unknown> = {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: topK,
      p_workspace_id: workspaceId,
    };
    if (kind) {
      rpcBody.p_kind = kind;
    }

    const searchResponse = await this.helpers.httpRequest({
      method: "POST",
      url: `${supabaseUrl}/rest/v1/rpc/match_archive_chunks`,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: rpcBody,
    });

    const hits = Array.isArray(searchResponse) ? searchResponse : [];

    // Build context string for downstream AI nodes
    const context = hits
      .map(
        (h: Record<string, unknown>, i: number) =>
          `[${i + 1}] (${h.title || "untitled"}, p.${h.page_number || "?"}): ${h.content || ""}`,
      )
      .join("\n\n");

    const items: INodeExecutionData[] = [
      {
        json: {
          hits: hits.map((h: Record<string, unknown>) => ({
            id: h.id,
            title: h.title,
            content: h.content,
            page_number: h.page_number,
            similarity: h.similarity,
            source_file: h.source_file,
          })),
          context,
          query,
          result_count: hits.length,
        },
      },
    ];

    return [items];
  }
}
