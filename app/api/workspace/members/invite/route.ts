// app/api/workspace/members/invite/route.ts
//
// Create a single-use invite token for the caller's workspace.
// Returns the shareable URL so the owner can copy it and send it
// out-of-band (text / email / Slack). The redemption flow lives at
// /auth/signup?token=... and was already wired up before team UI
// — this endpoint just gives owners a way to mint tokens without
// touching the database directly.
//
// Owner / admin only (per lib/rbac.ts can("workspace.invite_member")).

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/rbac";
import { isValidEmail } from "@/lib/invite";

export const dynamic = "force-dynamic";

const VALID_EXPIRY_DAYS = new Set([1, 7, 30]);

function generateToken(): string {
  // Format: DRIFT-XXXX-YYYY using a-z0-9 (ambiguous chars dropped).
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const part = (n: number) =>
    Array.from({ length: n }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");
  return `DRIFT-${part(4)}-${part(4)}`.toUpperCase();
}

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
    .select("id, workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!can(profile.role, "workspace.invite_member")) {
    return NextResponse.json(
      { error: "Only owners and admins can invite teammates." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string | null;
    expires_in_days?: number;
  };
  const email = (body.email || "").trim().toLowerCase() || null;
  if (email && !isValidEmail(email)) {
    return NextResponse.json(
      { error: "Email looks invalid." },
      { status: 400 },
    );
  }
  const expiresInDays = VALID_EXPIRY_DAYS.has(Number(body.expires_in_days))
    ? Number(body.expires_in_days)
    : 7;
  const expiresAt = new Date(
    Date.now() + expiresInDays * 86400_000,
  ).toISOString();

  // Mint a token; the unique index on token catches collisions, so
  // we retry up to 3 times before giving up.
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateToken();
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("invites")
      .insert({
        company_id: profile.workspace_id,
        workspace_id: profile.workspace_id,
        email,
        token,
        expires_at: expiresAt,
      })
      .select("id, token, expires_at")
      .single();
    if (insErr) {
      // 23505 = unique_violation on the token column.
      if (insErr.code === "23505") continue;
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";
    const row = inserted as {
      id: string;
      token: string;
      expires_at: string | null;
    };
    return NextResponse.json({
      ok: true,
      invite: row,
      link: `${baseUrl}/auth/signup?token=${row.token}`,
    });
  }
  return NextResponse.json(
    { error: "Could not allocate a unique invite token." },
    { status: 500 },
  );
}
