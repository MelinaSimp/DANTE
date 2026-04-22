// app/api/dante/briefs/route.ts
//
// GET  → list all cached briefs for the caller's workspace, joined
//        with contact name/email so the UI can render a ranked list.
//        Sorted by risk_level (critical → act_now → watch → healthy)
//        then by generated_at desc.
//
// POST → "Rank my book": bulk-generate briefs for every contact in
//        the workspace that doesn't have a fresh (<24h) brief.
//        Concurrency-limited so we don't melt the LLM rate limit.
//        Returns a summary of what was generated/skipped/failed.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateBriefForContact } from "@/lib/dante/briefs";
import { requireActiveBilling } from "@/lib/billing/gate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RISK_ORDER: Record<string, number> = {
  critical: 0,
  act_now: 1,
  watch: 2,
  healthy: 3,
};

/** Max parallel model calls during a Rank-my-book run. */
const CONCURRENCY = 4;

/** Cap per run so a 5000-contact workspace doesn't DDoS the model. */
const MAX_PER_RUN = 200;

/** A brief is "fresh" if generated within this many hours. */
const FRESH_HOURS = 24;

export async function GET() {
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

  const { data: briefs, error } = await supabaseAdmin
    .from("dante_briefs")
    .select(
      "contact_id, risk_level, headline, reasons, recommended_action, talking_points, confidence, model, generated_at"
    )
    .eq("workspace_id", profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const contactIds = (briefs ?? []).map((b) => b.contact_id);
  const { data: contacts } = contactIds.length
    ? await supabaseAdmin
        .from("contacts")
        .select("id, name, email, phone")
        .in("id", contactIds)
    : { data: [] as Array<{ id: string; name: string | null; email: string | null; phone: string | null }> };

  const byId = new Map((contacts ?? []).map((c) => [c.id, c]));

  const enriched = (briefs ?? [])
    .map((b) => ({ ...b, contact: byId.get(b.contact_id) || null }))
    .sort((a, b) => {
      const ra = RISK_ORDER[a.risk_level] ?? 99;
      const rb = RISK_ORDER[b.risk_level] ?? 99;
      if (ra !== rb) return ra - rb;
      return (
        new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
      );
    });

  return NextResponse.json({ briefs: enriched });
}

/**
 * Rank-my-book: generate briefs for all contacts missing a fresh one.
 * Body (optional): { force?: boolean } — if true, regenerate even
 * contacts with a fresh brief.
 */
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
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const workspace_id = profile.workspace_id;

  const gate = await requireActiveBilling(workspace_id);
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;

  // Pull every contact in the workspace.
  const { data: contacts, error: cErr } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("workspace_id", workspace_id);
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  const contactIds = (contacts ?? []).map((c) => c.id);

  // Figure out which contacts already have a fresh brief — skip unless forced.
  let toGenerate: string[] = contactIds;
  if (!force && contactIds.length > 0) {
    const freshCutoff = new Date(
      Date.now() - FRESH_HOURS * 3600_000
    ).toISOString();
    const { data: fresh } = await supabaseAdmin
      .from("dante_briefs")
      .select("contact_id")
      .eq("workspace_id", workspace_id)
      .gte("generated_at", freshCutoff)
      .in("contact_id", contactIds);
    const freshSet = new Set((fresh ?? []).map((b) => b.contact_id));
    toGenerate = contactIds.filter((id) => !freshSet.has(id));
  }

  const skipped = contactIds.length - toGenerate.length;
  if (toGenerate.length > MAX_PER_RUN) {
    toGenerate = toGenerate.slice(0, MAX_PER_RUN);
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  let generated = 0;
  let failed = 0;

  // Simple concurrency-limited map. Keeps us inside Anthropic's
  // burst limits and Vercel's 300s function cap.
  const queue = [...toGenerate];
  async function worker() {
    while (queue.length > 0) {
      const contact_id = queue.shift();
      if (!contact_id) break;
      try {
        const brief = await generateBriefForContact({
          workspace_id,
          contact_id,
          anthropicKey,
          openaiKey,
        });
        if (brief) generated++;
        else failed++;
      } catch (e) {
        console.warn("[briefs] rank-book worker error:", e);
        failed++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, toGenerate.length || 1) }, () =>
      worker()
    )
  );

  return NextResponse.json({
    total_contacts: contactIds.length,
    attempted: toGenerate.length,
    generated,
    failed,
    skipped_fresh: skipped,
    capped: (contactIds.length - skipped) > MAX_PER_RUN,
  });
}
