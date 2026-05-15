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
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json({ error: "admin_required" }, { status: 403 });
  }

  const { data: folders } = await supabaseAdmin
    .from("watched_folders")
    .select(
      "id, folder_path, folder_label, status, watcher_token, token_expires_at, last_seen_at, files_indexed_count, device_label",
    )
    .eq("workspace_id", profile.workspace_id)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  let ollama = { reachable: false, hermes_pulled: false, models_available: [] as string[] };
  try {
    const probe = await probeHermes();
    ollama = {
      reachable: probe.reachable,
      hermes_pulled: probe.hermes_pulled,
      models_available: probe.models_available ?? [],
    };
  } catch {}

  return NextResponse.json({
    folders: (folders || []).map((f: Record<string, unknown>) => ({
      id: f.id,
      folder_path: f.folder_path,
      folder_label: f.folder_label,
      status: f.status,
      watcher_token: f.watcher_token,
      token_expires_at: f.token_expires_at,
      last_seen_at: f.last_seen_at,
      files_indexed_count: f.files_indexed_count,
      device_label: f.device_label,
    })),
    ollama,
  });
}
