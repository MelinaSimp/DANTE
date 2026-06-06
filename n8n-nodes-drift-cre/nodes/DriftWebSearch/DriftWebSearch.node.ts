import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class DriftWebSearch implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Web Search",
    name: "driftWebSearch",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description: "Search the web for CRE market intel, listings, news, and regulatory updates via Tavily",
    defaults: {
      name: "Web Search",
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
        displayName: "Query",
        name: "query",
        type: "string",
        default: "",
        required: true,
        description: "Search query for CRE market intelligence",
      },
      {
        displayName: "Max Results",
        name: "maxResults",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 20 },
        default: 5,
        description: "Maximum number of search results to return",
      },
      {
        displayName: "Search Depth",
        name: "searchDepth",
        type: "options",
        options: [
          { name: "Basic", value: "basic" },
          { name: "Advanced", value: "advanced" },
        ],
        default: "basic",
        description: "Search depth: basic is faster, advanced retrieves more detail",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const query = this.getNodeParameter("query", 0, "") as string;
    const maxResults = this.getNodeParameter("maxResults", 0, 5) as number;
    const searchDepth = this.getNodeParameter("searchDepth", 0, "basic") as string;

    if (!query) {
      return [[{ json: { error: "query is required" } }]];
    }

    const tavilyKey = process.env.TAVILY_API_KEY;
    if (!tavilyKey) {
      return [[{ json: { error: "TAVILY_API_KEY not configured" } }]];
    }

    const response = await this.helpers.httpRequest({
      method: "POST",
      url: "https://api.tavily.com/search",
      headers: { "Content-Type": "application/json" },
      body: {
        api_key: tavilyKey,
        query,
        max_results: maxResults,
        search_depth: searchDepth,
        include_answer: true,
      },
    });

    const results = Array.isArray(response?.results)
      ? response.results.map((r: { title: string; url: string; content: string; score: number }) => ({
          json: {
            title: r.title,
            url: r.url,
            content: r.content,
            score: r.score,
          },
        }))
      : [];

    // Add the AI answer as the first item if available
    if (response?.answer) {
      results.unshift({
        json: {
          type: "answer",
          content: response.answer,
          query,
        },
      });
    }

    return [results.length > 0 ? results : [{ json: { message: "No results found", query } }]];
  }
}
