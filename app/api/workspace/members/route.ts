// app/api/workspace/members/route.ts
//
// GET — list every member of the caller's workspace plus pending
// invites. Any member can read; the team page is shared visibility
// so everyone can see who they're working with. Phone-enrolled state
// is exposed so the UI can show "no phone yet" badges.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function resolveCaller() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  return {
    user,
    profile: profile as { id: string; workspace_id: string | null; role: string | null } | null,
  };
}

export async function GET() {
  const ctx = await resolveCaller();
  if (!ctx?.profile?.workspace_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const wid = ctx.profile.workspace_id;

  // Pull members and outstanding invites in parallel. The members
  // list also surfaces phone-enrolled state — auth.users carries the
  // canonical email, so we cross-reference admin.listUsers afterward.
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select(
        "id, full_name, first_name, last_name, role, sms_phone, sms_verified_at, created_at, last_seen_at",
      )
      .eq("workspace_id", wid)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("invites")
      .select("id, email, token, expires_at, created_at")
      .eq("company_id", wid)
      .is("used_at", null)
      .order("created_at", { ascending: false }),
  ]);

  // Resolve emails — auth.users is the source of truth.
  const memberRows =
    (members as Array<{
      id: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
      role: string | null;
      sms_phone: string | null;
      sms_verified_at: string | null;
      created_at: string;
      last_seen_at: string | null;
    }>) || [];
  const emailById = new Map<string, string>();
  await Promise.all(
    memberRows.map(async (m) => {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(m.id);
        if (data.user?.email) emailById.set(m.id, data.user.email);
      } catch {
        /* fall through — email stays unresolved */
      }
    }),
  );

  return NextResponse.json({
    self_id: ctx.profile.id,
    self_role: ctx.profile.role,
    members: memberRows.map((m) => ({
      id: m.id,
      name:
        m.full_name ||
        [m.first_name, m.last_name].filter(Boolean).join(" ") ||
        null,
      email: emailById.get(m.id) || null,
      role: m.role || "member",
      phone_verified: !!m.sms_verified_at,
      created_at: m.created_at,
      last_seen_at: m.last_seen_at,
    })),
    invites: (invites || []) as Array<{
      id: string;
      email: string | null;
      token: string;
      expires_at: string | null;
      created_at: string;
    }>,
  });
}
