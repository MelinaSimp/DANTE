// POST /api/sms/verify/start
// Body: { phone: "+15551234567" }
//
// Generates a 6-digit code, hashes it, stores with a 10-min TTL,
// sends the plaintext to the user via SendBlue.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendMessage } from "@/lib/sms/sender";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function normalizePhone(p: string): string | null {
  const cleaned = p.replace(/[\s\-\(\)\.]/g, "");
  if (/^\+\d{10,15}$/.test(cleaned)) return cleaned;
  if (/^\d{10}$/.test(cleaned)) return "+1" + cleaned;
  if (/^1\d{10}$/.test(cleaned)) return "+" + cleaned;
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body?.phone || ""));
  if (!phone) {
    return NextResponse.json(
      { error: "Phone must be a 10-digit US number or E.164 (+15551234567)" },
      { status: 400 },
    );
  }

  // If this phone belongs to another user, verification will transfer
  // ownership — the rightful owner is whoever can receive the SMS code.

  // Generate 6-digit code, hash it
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min TTL

  // Store the verification challenge (don't store the plaintext code)
  const { error: insertErr } = await supabaseAdmin
    .from("sms_phone_verifications")
    .insert({
      user_id: user.id,
      phone,
      code_hash: codeHash,
      expires_at: expiresAt.toISOString(),
    });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Update the pending phone (not yet verified)
  await supabaseAdmin
    .from("profiles")
    .update({ sms_phone: phone, sms_verified_at: null })
    .eq("id", user.id);

  // Send the code
  try {
    await sendMessage(
      phone,
      `Your Drift verification code is ${code}. Expires in 10 minutes.`,
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: `Couldn't send verification SMS: ${err?.message}. Check that SendBlue is configured.`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, phone, expires_at: expiresAt.toISOString() });
}
