// lib/mcp/registry.ts
//
// Resolves `{ mcp: "<server_name>" }` entries in an agent step's
// tools[] config into concrete OpenAI tool defs at run start, and
// dispatches calls back through the MCP client.
//
// Two responsibilities:
//   1. listToolsForServer(workspaceId, name)
//      → fetch the cached catalog from mcp_servers, refresh if
//        stale, return the McpTool[] for the agent loop to expand.
//   2. callToolByQualifiedName(workspaceId, name, qualifiedName, args)
//      → dispatch tools/call against the right server. Tool names
//        are namespaced as "<server>__<tool>" inside the agent loop
//        to avoid collisions ("wealthbox__contacts.search" vs a
//        future native "contacts.search").

import { supabaseAdmin } from "@/lib/supabase/admin";
import { listTools, callTool } from "./client";
import type { McpServerRow, McpTool, McpToolResult } from "./types";

const CATALOG_TTL_MS = 60 * 60 * 1000; // 1h

async function loadServer(workspaceId: string, name: string): Promise<McpServerRow | null> {
  const { data, error } = await supabaseAdmin
    .from("mcp_servers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("name", name)
    .eq("enabled", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as McpServerRow;
}

export async function listToolsForServer(workspaceId: string, name: string): Promise<McpTool[]> {
  const server = await loadServer(workspaceId, name);
  if (!server) return [];

  const fetchedAt = server.catalog_fetched_at ? new Date(server.catalog_fetched_at).getTime() : 0;
  const fresh = Date.now() - fetchedAt < CATALOG_TTL_MS;
  if (fresh && Array.isArray(server.tools_catalog) && server.tools_catalog.length > 0) {
    return server.tools_catalog;
  }

  // Refresh.
  try {
    const tools = await listTools({ url: server.url, auth: server.auth });
    await supabaseAdmin
      .from("mcp_servers")
      .update({ tools_catalog: tools, catalog_fetched_at: new Date().toISOString() })
      .eq("id", server.id);
    return tools;
  } catch (err) {
    console.error(`[mcp] tools/list failed for ${name}:`, err);
    // Fall back to whatever we had cached, even if stale.
    return Array.isArray(server.tools_catalog) ? server.tools_catalog : [];
  }
}

export async function callMcpTool(
  workspaceId: string,
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const server = await loadServer(workspaceId, serverName);
  if (!server) {
    return { isError: true, content: [{ type: "text", text: `MCP server not found: ${serverName}` }] };
  }
  return callTool({ url: server.url, auth: server.auth }, toolName, args);
}

/**
 * Expand a list of MCP server entries into OpenAI-shaped tool defs.
 * Tool names are namespaced "<server>__<tool>" so the dispatcher
 * can route back to the right server when the model calls them.
 */
export async function expandMcpTools(
  workspaceId: string,
  servers: string[],
): Promise<Array<{ type: "function"; function: { name: string; description: string; parameters: object } }>> {
  const out: Array<{
    type: "function";
    function: { name: string; description: string; parameters: object };
  }> = [];
  for (const serverName of servers) {
    const tools = await listToolsForServer(workspaceId, serverName);
    for (const t of tools) {
      out.push({
        type: "function",
        function: {
          // OpenAI tool names must match ^[a-zA-Z0-9_-]+$ — the dot
          // in "contacts.search" is rejected. Replace with __ here
          // and reverse on dispatch.
          name: `mcp__${serverName}__${t.name.replace(/\./g, "_")}`,
          description: `[${serverName}] ${t.description || t.name}`,
          parameters: t.inputSchema || { type: "object" },
        },
      });
    }
  }
  return out;
}

/** Reverse the namespacing applied above. Returns null if `qualified`
 *  doesn't look like an MCP tool name. */
export function parseMcpToolName(qualified: string): { server: string; tool: string } | null {
  if (!qualified.startsWith("mcp__")) return null;
  const rest = qualified.slice("mcp__".length);
  const sep = rest.indexOf("__");
  if (sep === -1) return null;
  const server = rest.slice(0, sep);
  const tool = rest.slice(sep + 2).replace(/_/g, ".");
  return { server, tool };
}
