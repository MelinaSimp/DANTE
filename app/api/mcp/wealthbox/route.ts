// /api/mcp/wealthbox — first-party MCP server for Wealthbox.
//
// Speaks JSON-RPC 2.0 over HTTPS. Supports `tools/list` and
// `tools/call`. The actual Wealthbox HTTP calls go to
// https://api.crmworkspace.com/v1 with a bearer token the caller
// supplies via Authorization header — we don't store Wealthbox keys
// server-side; the agent runner pulls them from mcp_servers.auth and
// forwards.
//
// Tools exposed (read-only Phase 2):
//   contacts.search    — by name or email
//   contacts.get       — full contact record by id
//   tasks.list         — open tasks for a contact
//   notes.list         — notes for a contact, newest first
//
// Phase 3 will add write tools (notes.create, tasks.create) once the
// auth + per-tool budget story is settled.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const WEALTHBOX_API = "https://api.crmworkspace.com/v1";

const TOOL_CATALOG = [
  {
    name: "contacts.search",
    description: "Search Wealthbox contacts by name or email. Returns an array of matches.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "contacts.get",
    description: "Fetch one Wealthbox contact by id. Returns the full record (name, household, email, phone, notes summary).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "tasks.list",
    description: "List open tasks in Wealthbox, optionally filtered to a contact.",
    inputSchema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "notes.list",
    description: "List recent Wealthbox notes for a contact, newest first.",
    inputSchema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        limit: { type: "number" },
      },
      required: ["contact_id"],
    },
  },
] as const;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

function rpcError(id: string, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

function rpcOk(id: string, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

async function wealthboxFetch(token: string, path: string, params?: URLSearchParams) {
  const url = `${WEALTHBOX_API}${path}${params ? `?${params.toString()}` : ""}`;
  const res = await fetch(url, {
    headers: {
      ACCESS_TOKEN: token,                 // Wealthbox uses this header, not Bearer
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Wealthbox ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: "0", error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  const id = body.id || "0";

  // Auth: the caller (agent runner) passes the Wealthbox token via
  // Authorization: Bearer <token>. We don't accept it in the body —
  // that would put it in run logs.
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token && body.method !== "tools/list") {
    return rpcError(id, -32001, "Missing Wealthbox token (Authorization: Bearer ...)");
  }

  try {
    if (body.method === "tools/list") {
      return rpcOk(id, { tools: TOOL_CATALOG });
    }

    if (body.method === "tools/call") {
      const { name, arguments: args } = (body.params || {}) as {
        name: string;
        arguments: Record<string, unknown>;
      };

      switch (name) {
        case "contacts.search": {
          const q = String(args.query || "");
          const limit = Number(args.limit) || 10;
          const params = new URLSearchParams({ query: q, per_page: String(limit) });
          const result = await wealthboxFetch(token, "/contacts", params);
          return rpcOk(id, {
            content: [{ type: "json", data: result }],
          });
        }
        case "contacts.get": {
          const result = await wealthboxFetch(token, `/contacts/${args.id}`);
          return rpcOk(id, { content: [{ type: "json", data: result }] });
        }
        case "tasks.list": {
          const params = new URLSearchParams();
          if (args.contact_id) params.set("contact_id", String(args.contact_id));
          if (args.limit) params.set("per_page", String(args.limit));
          const result = await wealthboxFetch(token, "/tasks", params);
          return rpcOk(id, { content: [{ type: "json", data: result }] });
        }
        case "notes.list": {
          const params = new URLSearchParams({
            contact_id: String(args.contact_id || ""),
            per_page: String(args.limit || 20),
          });
          const result = await wealthboxFetch(token, "/notes", params);
          return rpcOk(id, { content: [{ type: "json", data: result }] });
        }
        default:
          return rpcError(id, -32601, `Unknown tool: ${name}`);
      }
    }

    return rpcError(id, -32601, `Unknown method: ${body.method}`);
  } catch (err) {
    return rpcError(id, -32000, err instanceof Error ? err.message : "tool error");
  }
}
