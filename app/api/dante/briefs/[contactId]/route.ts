// app/api/dante/briefs/[contactId]/route.ts
//
// GET  → return the cached brief for a contact, or generate one on the
//        fly if the cache is stale (>24h) or missing.
// POST → force-regenerate and replace the cache (e.g. user clicks
//        "Refresh brief" on the UI).
//
// Lazy on-view generation means small workspaces don't pay for briefs
// they'll never look at. 24h cache means a heavy day of browsing
// doesn't rerun the model repeatedly on the same contact.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  generateBriefForContact,
  getCachedBrief,
} from "@/lib/dante/briefs";
import { requireActiveBilling } from "@/lib/billing/gate";

export const dynamic = "force-dynamic";

async function requireWorkspace(): Promise<
  { ok: true; workspace_id: string } | { ok: false; res: NextResponse }
> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return {
      ok: false,
      res: NextResponse.json({ error: "No workspace" }, { status: 400 }),
    };
  }
  return { ok: true, workspace_id: profile.workspace_id };
}

async function assertContactInWorkspace(
  contactId: string,
  workspaceId: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return !!data;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ contactId: string }> }
) {
  const auth = await requireWorkspace();
  if (!auth.ok) return auth.res;
  const { contactId } = await ctx.params;

  if (!(await assertContactInWorkspace(contactId, auth.workspace_id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cached = await getCachedBrief({
    workspace_id: auth.workspace_id,
    contact_id: contactId,
  });
  if (cached) return NextResponse.json({ brief: cached, fresh: false });

  // Cache miss → about to spend model tokens. Gate before generation so
  // a past_due or capped workspace doesn't rack up charges.
  const gate = await requireActiveBilling(auth.workspace_id);
  if (!gate.ok) return gate.response;

  const brief = await generateBriefForContact({
    workspace_id: auth.workspace_id,
    contact_id: contactId,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
  });
  if (!brief) {
    return NextResponse.json(
      { error: "Could not generate brief — insufficient data or model error" },
      { status: 502 }
    );
  }
  return NextResponse.json({ brief, fresh: true });
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ contactId: string }> }
) {
  const auth = await requireWorkspace();
  if (!auth.ok) return auth.res;
  const { contactId } = await ctx.params;

  if (!(await assertContactInWorkspace(contactId, auth.workspace_id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const gate = await requireActiveBilling(auth.workspace_id);
  if (!gate.ok) return gate.response;

  const brief = await generateBriefForContact({
    workspace_id: auth.workspace_id,
    contact_id: contactId,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
  });
  if (!brief) {
    return NextResponse.json(
      { error: "Could not generate brief — insufficient data or model error" },
      { status: 502 }
    );
  }
  return NextResponse.json({ brief, fresh: true });
}
