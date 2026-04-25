import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/oauth/microsoft";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "no workspace" }, { status: 400 });

  try {
    return NextResponse.redirect(buildAuthUrl(profile.workspace_id, user.id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OAuth misconfigured" },
      { status: 500 },
    );
  }
}
