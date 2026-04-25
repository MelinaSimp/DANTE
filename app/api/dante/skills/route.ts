// /api/dante/skills — list (GET) and create (POST) workspace skills.
//
// Edits create new versions rather than mutating, so audit trails
// always point to the exact prompt that produced an output. The
// list endpoint collapses to the highest enabled version per name.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AgentToolEntry } from "@/lib/dante/workflow-types";

export const dynamic = "force-dynamic";

const ALLOWED_TOOLS: ReadonlyArray<string> = [
  "memory.search",
  "memory.write",
  "archive.search",
  "vault.cite",
  "clients.query",
  "clients.update",
  "email.send",
  "http.fetch",
  "skill.run",
];

interface CreateBody {
  name?: string;
  description?: string;
  objective?: string;
  system?: string | null;
  tools?: unknown;
  max_steps?: number;
  auto_approve?: boolean;
  input_schema?: Record<string, unknown>;
}

function validate(body: CreateBody): { ok: true } | { ok: false; error: string } {
  const name = (body.name || "").trim();
  if (!name) return { ok: false, error: "name is required" };
  if (!/^[a-z0-9_]+$/.test(name)) {
    return { ok: false, error: "name must be lowercase letters, digits, underscores" };
  }
  if (!(body.description || "").trim()) return { ok: false, error: "description is required" };
  if (!(body.objective || "").trim()) return { ok: false, error: "objective is required" };
  if (!Array.isArray(body.tools)) return { ok: false, error: "tools must be an array" };

  for (const t of body.tools as unknown[]) {
    if (typeof t === "string") {
      if (!ALLOWED_TOOLS.includes(t)) return { ok: false, error: `unknown tool: ${t}` };
    } else if (t && typeof t === "object" && "mcp" in (t as object)) {
      // Trust MCP entries — registry will validate at run time.
    } else {
      return { ok: false, error: "tools entries must be strings or { mcp: name }" };
    }
  }
  return { ok: true };
}

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ skills: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("dante_skills")
    .select("id, name, version, description, config, input_schema, auto_approve, enabled, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .eq("enabled", true)
    .order("name", { ascending: true })
    .order("version", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Collapse to one row per name (the highest version).
  const seen = new Set<string>();
  const skills = (data || []).filter((row) => {
    if (seen.has(row.name)) return false;
    seen.add(row.name);
    return true;
  });

  return NextResponse.json({ skills });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "no workspace" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as CreateBody;
  const v = validate(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // Bump version: highest existing + 1, regardless of enabled state,
  // so audit history is monotonic even after disabling.
  const { data: existing } = await supabaseAdmin
    .from("dante_skills")
    .select("version")
    .eq("workspace_id", profile.workspace_id)
    .eq("name", body.name!)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = ((existing?.version as number) || 0) + 1;

  // If we're creating a new version, disable older versions of the
  // same name so retrieval picks up the new one.
  if (nextVersion > 1) {
    await supabaseAdmin
      .from("dante_skills")
      .update({ enabled: false })
      .eq("workspace_id", profile.workspace_id)
      .eq("name", body.name!);
  }

  const { data: created, error } = await supabaseAdmin
    .from("dante_skills")
    .insert({
      workspace_id: profile.workspace_id,
      name: body.name,
      version: nextVersion,
      description: body.description,
      config: {
        objective: body.objective,
        system: body.system || undefined,
        tools: body.tools as AgentToolEntry[],
        max_steps: Number(body.max_steps) || 6,
      },
      input_schema: body.input_schema || {},
      auto_approve: !!body.auto_approve,
      enabled: true,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, skill: created });
}
