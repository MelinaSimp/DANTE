// app/api/dante/secrets/route.ts
//
// Workspace-scoped secret vault for Dante workflows.
//
// GET   → list keys + masked previews (never the raw value)
// POST  → create or update by key (upsert)
//
// The table has RLS that only allows service_role to read/write, so
// a logged-in user can't SELECT raw values even with a direct DB
// connection. All access goes through this route, which masks.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function requireWorkspace() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) {
    return { error: NextResponse.json({ error: "No workspace" }, { status: 400 }) };
  }
  return { user, workspaceId: profile.workspace_id as string };
}

/** Show first 4 + last 4 chars, stars in between. Never return raw. */
function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••";
  return `${value.slice(0, 4)}${"•".repeat(Math.max(4, Math.min(20, value.length - 8)))}${value.slice(-4)}`;
}

export async function GET() {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;

  const { data, error } = await supabaseAdmin
    .from("dante_secrets")
    .select("id, key, value, description, created_at, updated_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("key", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    secrets: (data || []).map((s) => ({
      id: s.id,
      key: s.key,
      preview: mask(s.value as string),
      description: s.description,
      created_at: s.created_at,
      updated_at: s.updated_at,
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const value = typeof body.value === "string" ? body.value : "";
  const description = typeof body.description === "string" ? body.description : null;

  if (!key) return NextResponse.json({ error: "Key required" }, { status: 400 });
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
    return NextResponse.json(
      { error: "Key must be a valid identifier (letters, digits, underscore; no leading digit)" },
      { status: 400 },
    );
  }
  if (!value) return NextResponse.json({ error: "Value required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("dante_secrets")
    .upsert({
      workspace_id: ctx.workspaceId,
      key,
      value,
      description,
      created_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,key" })
    .select("id, key, description, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ secret: data });
}
