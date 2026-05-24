// POST /api/onboarding/complete
//
// Finalises the onboarding wizard: saves the firm name onto the
// workspace, seeds any knowledge entries the user chose to keep, and
// stamps workspaces.onboarded_at so the wizard never fires for this
// workspace again. Skip and Finish both hit this endpoint — skip just
// sends an empty entries array.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { defaultSkillSeedsFor } from "@/lib/industry/skills";
import type { Industry } from "@/lib/industry/config";

export const dynamic = "force-dynamic";

function normalizeIndustry(_value: unknown): Industry {
  return "real_estate";
}

interface SeedEntryPayload {
  category: string;
  title: string;
  content: string;
}

function sanitizeEntries(raw: unknown): SeedEntryPayload[] {
  if (!Array.isArray(raw)) return [];
  const out: SeedEntryPayload[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const category = String((item as any).category ?? "").trim();
    const title = String((item as any).title ?? "").trim();
    const content = String((item as any).content ?? "").trim();
    if (!category || !title || !content) continue;
    // Soft caps so a pasted novel can't poison the knowledge table.
    out.push({
      category: category.slice(0, 60),
      title: title.slice(0, 200),
      content: content.slice(0, 4000),
    });
  }
  // Also cap entry count — the wizard only shows ~6, so 20 is slack.
  return out.slice(0, 20);
}

export async function POST(request: Request) {
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

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — treat it as a skip.
  }

  const firmName =
    typeof body?.firmName === "string" ? body.firmName.trim().slice(0, 120) : "";
  const entries = sanitizeEntries(body?.entries);

  // Update workspace name only if we got one. Don't clobber an existing
  // name with an empty string if the user nuked the field.
  const workspaceUpdate: Record<string, any> = {
    onboarded_at: new Date().toISOString(),
  };
  if (firmName) workspaceUpdate.name = firmName;

  const { error: wsErr } = await supabaseAdmin
    .from("workspaces")
    .update(workspaceUpdate)
    .eq("id", profile.workspace_id);
  if (wsErr) {
    console.error("[onboarding] workspace update failed:", wsErr);
    return NextResponse.json(
      { error: "Failed to save workspace" },
      { status: 500 },
    );
  }

  // Seed the vertical's default skills. Idempotent via the
  // (workspace_id, name, version) unique constraint — re-running
  // onboarding (shouldn't happen, but defensively) won't duplicate.
  // Read industry fresh so we use whatever auth/callback stamped.
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("industry")
    .eq("id", profile.workspace_id)
    .maybeSingle();
  const industry = normalizeIndustry(ws?.industry);
  const skillRows = defaultSkillSeedsFor(industry).map((s) => ({
    workspace_id: profile.workspace_id,
    name: s.name,
    version: 1,
    description: s.description,
    config: s.config,
    input_schema: s.input_schema,
    auto_approve: s.auto_approve,
  }));
  if (skillRows.length > 0) {
    const { error: skillErr } = await supabaseAdmin
      .from("dante_skills")
      .upsert(skillRows, {
        onConflict: "workspace_id,name,version",
        ignoreDuplicates: true,
      });
    if (skillErr) {
      // Non-fatal — onboarded_at still lands. Skills can be created
      // manually under Settings if this ever silently fails.
      console.error("[onboarding] skill seed failed:", skillErr);
    }
  }

  // Best-effort knowledge seed. Use the RLS-aware server client so the
  // rows are owned correctly (same path the settings form uses).
  if (entries.length > 0) {
    const rows = entries.map((e) => ({
      workspace_id: profile.workspace_id,
      category: e.category,
      title: e.title,
      content: e.content,
    }));
    const { error: kbErr } = await supabase.from("knowledge_base").insert(rows);
    if (kbErr) {
      // Not fatal — the onboarded_at stamp still lands, the user lands
      // on the dashboard, and they can re-add entries under Settings.
      console.error("[onboarding] knowledge seed failed:", kbErr);
    }
  }

  return NextResponse.json({ ok: true });
}
