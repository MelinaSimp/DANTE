// Create a customer-defined autonomous agent. Writes a row into
// wm_agent_definitions with is_custom=true so the engine knows to use the
// generic data loader + user-provided instructions instead of a preset.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ALLOWED_SOURCES = new Set([
  "contacts",
  "sales",
  "conversations",
  "appointments",
  "tasks_activity",
  "churn_signals",
]);

// Keep in sync with the icon map in app/dashboard/agents/page.tsx
const ALLOWED_ICONS = new Set([
  "Users",
  "DollarSign",
  "MessageSquare",
  "CheckCircle",
  "AlertTriangle",
  "Zap",
  "Bot",
  "Sparkles",
  "Lightbulb",
  "FileText",
  "Bell",
]);

const ALLOWED_COLORS = new Set([
  "text-blue-400",
  "text-emerald-400",
  "text-purple-400",
  "text-amber-400",
  "text-rose-400",
  "text-cyan-400",
  "text-fuchsia-400",
  "text-indigo-400",
]);

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  const wid = profile?.workspace_id;
  if (!wid) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
  const instructions =
    typeof body.custom_instructions === "string"
      ? body.custom_instructions.trim()
      : "";
  const rawSources: unknown[] = Array.isArray(body.data_sources)
    ? body.data_sources
    : [];
  const dataSources = rawSources
    .filter((s): s is string => typeof s === "string")
    .filter((s) => ALLOWED_SOURCES.has(s));

  const icon =
    typeof body.icon === "string" && ALLOWED_ICONS.has(body.icon)
      ? body.icon
      : "Sparkles";
  const colorClass =
    typeof body.color_class === "string" && ALLOWED_COLORS.has(body.color_class)
      ? body.color_class
      : "text-fuchsia-400";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Name too long" }, { status: 400 });
  }
  if (!instructions) {
    return NextResponse.json(
      { error: "Instructions are required — tell the agent what to do" },
      { status: 400 }
    );
  }
  if (instructions.length > 4000) {
    return NextResponse.json(
      { error: "Instructions too long (max 4000 chars)" },
      { status: 400 }
    );
  }
  if (dataSources.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one data source for the agent to analyze" },
      { status: 400 }
    );
  }

  // One-line purpose shown on the agent card. If not provided, derive it.
  const finalPurpose =
    purpose ||
    instructions.split(/[.\n]/)[0].slice(0, 200) ||
    "Custom autonomous agent";

  const { data: inserted, error } = await supabaseAdmin
    .from("wm_agent_definitions")
    .insert({
      workspace_id: wid,
      name: name.slice(0, 80),
      purpose: finalPurpose.slice(0, 300),
      custom_instructions: instructions,
      data_sources: dataSources,
      icon,
      color_class: colorClass,
      type: "AUTONOMOUS",
      status: "IDLE",
      is_custom: true,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Create custom agent error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create agent" },
      { status: 500 }
    );
  }

  return NextResponse.json({ agent: inserted });
}
