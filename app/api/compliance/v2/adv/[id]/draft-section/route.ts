// POST /api/compliance/v2/adv/[id]/draft-section
// Body: { item: "1" | "2" | ... | "19", facts?: { firm_name, aum_regulatory, ... } }
//
// Asks the LLM to draft a Form ADV Part 2A section based on the
// SEC's prescribed content (lib/compliance/adv-sections.ts) plus
// workspace facts (firm name, AUM, services). Returns the drafted
// markdown content; the CCO edits and saves via the generic PATCH.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdvSection } from "@/lib/compliance/adv-sections";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const workspaceId = profile.workspace_id as string;

  const body = await req.json().catch(() => ({}));
  const item = String(body.item || "");
  const section = getAdvSection(item);
  if (!section) {
    return NextResponse.json(
      { error: `Unknown ADV item '${item}'` },
      { status: 400 }
    );
  }

  // Verify the ADV draft belongs to this workspace.
  const { data: draft } = await supabaseAdmin
    .from("compliance_adv_drafts")
    .select("id, sections")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  // Pull workspace facts to ground the draft. Three layers, last
  // wins:
  //   1. workspaces.name (basic fallback)
  //   2. workspace_compliance_facts (CCO-maintained, reused across
  //      drafts and items)
  //   3. body.facts (per-call override the UI may pass)
  const [{ data: ws }, { data: factsRow }] = await Promise.all([
    supabaseAdmin
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle(),
    supabaseAdmin
      .from("workspace_compliance_facts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  const facts: Record<string, unknown> = {
    firm_name: (ws as any)?.name || "[FIRM]",
  };
  if (factsRow) {
    for (const [k, v] of Object.entries(factsRow as Record<string, unknown>)) {
      if (k === "workspace_id" || k === "updated_at" || k === "updated_by") continue;
      if (v !== null && v !== undefined && v !== "") {
        facts[k] = v;
      }
    }
  }
  Object.assign(facts, body.facts || {});

  const factLines = Object.entries(facts)
    .map(([k, v]) => `  - ${k}: ${v ?? "[TO BE COMPLETED]"}`)
    .join("\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const prompt =
    `You are drafting Item ${section.item} of Form ADV Part 2A for a US-registered investment adviser.\n\n` +
    `## Item ${section.item} — ${section.title}\n\n` +
    `**SEC requirement:** ${section.description}\n\n` +
    `**Drafting hint:** ${section.drafting_hint}\n\n` +
    `## Workspace facts\n${factLines}\n\n` +
    `## Instructions\n` +
    `- Output Markdown for this single section.\n` +
    `- Use plain English. The brochure must be readable by clients.\n` +
    `- Where a fact is unknown, insert "[TO BE COMPLETED]" so the CCO can fill it in.\n` +
    `- Do not invent disciplinary events, assets under management, ownership, or fee schedules. ` +
    `If you don't have the fact, mark it [TO BE COMPLETED].\n` +
    `- Stay close to SEC convention — the CCO will recognize the right structure.\n` +
    `- Output ONLY the section content. No preamble, no closing remarks.\n`;

  let content = "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json(
        { error: `Anthropic error: ${r.status} ${t.slice(0, 200)}` },
        { status: 502 }
      );
    }
    const d = await r.json();
    content = (d.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text || "")
      .join("")
      .trim();
  } catch (e: any) {
    return NextResponse.json(
      { error: `Draft generation failed: ${e?.message}` },
      { status: 500 }
    );
  }

  // Persist the section into the draft. We don't auto-save other
  // sections — this route writes the one we just generated.
  const sections = ((draft as any).sections as Record<string, any>) || {};
  sections[`item_${item}`] = {
    title: section.title,
    content,
    last_edited_at: new Date().toISOString(),
    last_edited_by: user.id,
  };

  const { error } = await supabaseAdmin
    .from("compliance_adv_drafts")
    .update({ sections, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    item: section.item,
    title: section.title,
    content,
  });
}
