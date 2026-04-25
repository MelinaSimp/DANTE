// lib/mcp/client.ts
//
// Minimal MCP-over-HTTP client. We speak JSON-RPC 2.0 with two
// methods: `tools/list` and `tools/call`. That's enough for the
// agent loop to plug in a third-party tool server without us
// having to write a custom adapter per vendor.
//
// Why not the official MCP SDK? It's stdio/SSE-shaped — built for
// long-running subprocess clients. We're calling out from a Vercel
// function, where a fresh HTTPS request per call is the right model.
// The protocol is small enough that a 60-line client is cheaper
// than fighting the SDK's lifecycle assumptions.
//
// Auth shapes supported in Phase 1:
//   { kind: "apikey", header: string, value: string }
//   { kind: "bearer", token: string }
//   { kind: "none" } (default)
// OAuth comes in Phase 2 alongside the Wealthbox connector — it
// needs a refresh dance that doesn't belong in a stateless client.

import type { McpClientServer, McpTool, McpToolResult } from "./types";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

function authHeaders(auth: Record<string, unknown>): Record<string, string> {
  const kind = String(auth.kind || "none");
  switch (kind) {
    case "apikey": {
      const header = String(auth.header || "X-API-Key");
      const value = String(auth.value || "");
      return value ? { [header]: value } : {};
    }
    case "bearer": {
      const token = String(auth.token || "");
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
    default:
      return {};
  }
}

async function callRpc<T>(server: McpClientServer, method: string, params?: unknown): Promise<T> {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    method,
    params,
  };
  const res = await fetch(server.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(server.auth),
    },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MCP ${method} ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as JsonRpcResponse<T>;
  if (json.error) {
    throw new Error(`MCP ${method} error ${json.error.code}: ${json.error.message}`);
  }
  if (json.result === undefined) {
    throw new Error(`MCP ${method}: empty result`);
  }
  return json.result;
}

export async function listTools(server: McpClientServer): Promise<McpTool[]> {
  const result = await callRpc<{ tools: McpTool[] }>(server, "tools/list");
  return result.tools || [];
}

export async function callTool(
  server: McpClientServer,
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  return callRpc<McpToolResult>(server, "tools/call", { name, arguments: args });
}
