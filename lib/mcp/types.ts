// lib/mcp/types.ts
//
// Shape definitions matching the Model Context Protocol spec at
// the level we care about. We don't implement the full spec — only
// the two methods the agent loop needs (tools/list, tools/call) —
// but the types below are aligned so a future expansion to
// resources/prompts/sampling doesn't require renaming anything.

export interface McpServerRow {
  id: string;
  workspace_id: string;
  name: string;
  url: string;
  auth: Record<string, unknown>;
  enabled: boolean;
  tools_catalog: McpTool[];
  catalog_fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface McpTool {
  name: string;
  description?: string;
  /** JSON Schema for the tool's arguments. Pass straight through to
   *  OpenAI's tool spec; the model will populate it. */
  inputSchema: object;
}

export interface McpToolResult {
  /** Optional structured payload the model can read directly. */
  content?: Array<{ type: "text"; text: string } | { type: "json"; data: unknown }>;
  isError?: boolean;
  /** Free-form metadata (rate-limit info, request id, ...). */
  meta?: Record<string, unknown>;
}

export interface McpClientServer {
  url: string;
  auth: Record<string, unknown>;
}
