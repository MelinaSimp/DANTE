// app/api/me/local-mode/route.ts
//
// Capability probe for local-only mode. Tells the UI:
//   • Whether local mode is even available (Ollama reachable +
//     Hermes pulled).
//   • The workspace's current default processing mode.
//   • Operational details (Ollama base URL, available models).
//
// The web app calls this to decide whether to render the privacy-
// mode toggle. When `available=false`, the toggle is hidden so
// users don't pick an option that won't work; we show a "set up
// local mode" link instead pointing at install instructions.
//
// In production, the Electron app's renderer will call this
// against its own bundled Ollama instead of the dev-host's. For
// now the server-side probe is what's reachable.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { probeHermes } from "@/lib/llm/providers/hermes";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: profile } = await sb
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = (profile as { workspace_id?: string | null } | null)
    ?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  const [probe, ws] = await Promise.all([
    probeHermes(),
    supabaseAdmin
      .from("workspaces")
      .select("default_processing_mode")
      .eq("id", workspaceId)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    available: probe.reachable && probe.hermes_pulled,
    workspace_default:
      (ws.data as { default_processing_mode?: "cloud" | "local_only" } | null)
        ?.default_processing_mode || "cloud",
    ollama: {
      reachable: probe.reachable,
      hermes_pulled: probe.hermes_pulled,
      base_url: probe.base_url,
      models_available: probe.models_available,
    },
  });
}
