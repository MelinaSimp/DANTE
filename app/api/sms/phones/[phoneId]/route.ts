// DELETE /api/sms/phones/[phoneId] — disconnect a verified SMS phone
// PATCH  /api/sms/phones/[phoneId] — update fields (currently only is_primary, label)
//
// Disconnecting the primary phone promotes the next-oldest one (if any)
// to primary so outbound paths still have a destination.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getUserId() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function syncLegacyPrimary(profileId: string) {
  // Keep profiles.sms_phone + sms_verified_at synced to the row flagged
  // primary so legacy outbound paths (briefing cron, dante nudge) don't
  // need to know about the new table.
  const { data: prim } = await supabaseAdmin
    .from("profile_sms_phones")
    .select("phone, verified_at")
    .eq("profile_id", profileId)
    .eq("is_primary", true)
    .maybeSingle();
  await supabaseAdmin
    .from("profiles")
    .update({
      sms_phone: (prim as any)?.phone ?? null,
      sms_verified_at: (prim as any)?.verified_at ?? null,
    })
    .eq("id", profileId);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ phoneId: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { phoneId } = await ctx.params;

  // Confirm the row belongs to the caller before deleting.
  const { data: row } = await supabaseAdmin
    .from("profile_sms_phones")
    .select("id, profile_id, is_primary")
    .eq("id", phoneId)
    .maybeSingle();
  if (!row || (row as any).profile_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await supabaseAdmin.from("profile_sms_phones").delete().eq("id", phoneId);

  // If we deleted the primary, promote the next oldest row to primary.
  if ((row as any).is_primary) {
    const { data: next } = await supabaseAdmin
      .from("profile_sms_phones")
      .select("id")
      .eq("profile_id", userId)
      .order("verified_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      await supabaseAdmin
        .from("profile_sms_phones")
        .update({ is_primary: true })
        .eq("id", (next as any).id);
    }
  }

  await syncLegacyPrimary(userId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ phoneId: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { phoneId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const { data: row } = await supabaseAdmin
    .from("profile_sms_phones")
    .select("id, profile_id")
    .eq("id", phoneId)
    .maybeSingle();
  if (!row || (row as any).profile_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, any> = {};
  if (typeof body?.label === "string") updates.label = body.label.trim() || null;

  if (body?.is_primary === true) {
    // Demote every other row first to keep the unique-primary constraint
    // happy, then promote this one.
    await supabaseAdmin
      .from("profile_sms_phones")
      .update({ is_primary: false })
      .eq("profile_id", userId)
      .neq("id", phoneId);
    updates.is_primary = true;
  } else if (body?.is_primary === false) {
    updates.is_primary = false;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await supabaseAdmin.from("profile_sms_phones").update(updates).eq("id", phoneId);
  await syncLegacyPrimary(userId);
  return NextResponse.json({ ok: true });
}
