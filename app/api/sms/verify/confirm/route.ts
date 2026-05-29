// POST /api/sms/verify/confirm
// Body: { code: "123456" }
//
// Looks up the most recent unconsumed verification for this user,
// hashes the submitted code, compares. On match: marks
// profiles.sms_verified_at and consumes the verification row.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const code = String(body?.code || "").trim();
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Enter the 6-digit code we just texted you." },
      { status: 400 },
    );
  }

  const { data: pending } = await supabaseAdmin
    .from("sms_phone_verifications")
    .select("id, phone, code_hash, attempts, expires_at, consumed_at")
    .eq("user_id", user.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) {
    return NextResponse.json(
      { error: "No pending verification. Send a fresh code first." },
      { status: 400 },
    );
  }

  const row = pending as any;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "That code expired. Send a new one." },
      { status: 400 },
    );
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many attempts. Send a new code." },
      { status: 429 },
    );
  }

  const submittedHash = crypto.createHash("sha256").update(code).digest("hex");
  if (submittedHash !== row.code_hash) {
    await supabaseAdmin
      .from("sms_phone_verifications")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return NextResponse.json({ error: "Code didn't match." }, { status: 400 });
  }

  // Match — consume + verify. Two storage targets:
  //   • profile_sms_phones (new, multi-row) — append a row; if another
  //     profile previously held this number, transfer ownership
  //     (delete the old row first; verified SMS ownership = rightful
  //     owner, last to verify wins).
  //   • profiles.sms_phone (legacy, single-column) — synced to the
  //     primary phone after the insert so existing outbound paths
  //     don't need to query the new table yet.
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("sms_phone_verifications")
    .update({ consumed_at: now })
    .eq("id", row.id);

  // Transfer ownership: drop any row for this phone on other profiles.
  await supabaseAdmin
    .from("profile_sms_phones")
    .delete()
    .eq("phone", row.phone)
    .neq("profile_id", user.id);

  // Does the caller already have at least one verified phone? If not,
  // this becomes their primary automatically.
  const { count: existingCount } = await supabaseAdmin
    .from("profile_sms_phones")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", user.id);
  const shouldBePrimary = (existingCount ?? 0) === 0;

  await supabaseAdmin
    .from("profile_sms_phones")
    .upsert(
      {
        profile_id: user.id,
        phone: row.phone,
        is_primary: shouldBePrimary,
        verified_at: now,
      },
      { onConflict: "phone" },
    );

  // Sync legacy single-column to the primary phone for this profile.
  const { data: primary } = await supabaseAdmin
    .from("profile_sms_phones")
    .select("phone, verified_at")
    .eq("profile_id", user.id)
    .eq("is_primary", true)
    .maybeSingle();
  await supabaseAdmin
    .from("profiles")
    .update({
      sms_phone: (primary as any)?.phone ?? row.phone,
      sms_verified_at: (primary as any)?.verified_at ?? now,
    })
    .eq("id", user.id);
  // Clear the legacy column on any other profile that had it.
  await supabaseAdmin
    .from("profiles")
    .update({ sms_phone: null, sms_verified_at: null })
    .eq("sms_phone", row.phone)
    .neq("id", user.id);

  // Find workspace for audit log
  const { data: prof } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (prof && (prof as any).workspace_id) {
    await logAuditEvent({
      action: "sms.phone.verified",
      actorUserId: user.id,
      workspaceId: (prof as any).workspace_id,
      entityType: "profile",
      entityId: user.id,
      metadata: { phone: row.phone },
      request: req,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, phone: row.phone, verified_at: now });
}
