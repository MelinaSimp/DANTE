// app/api/workspace/industry/route.ts
//
// Tiny endpoint backing useIndustry(). Returns the current
// workspace's industry ('financial_advisor' | 'real_estate' | null).
// Cached aggressively in the client (5 min); read-only.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ industry: null });

  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("industry")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  const industry = (ws as { industry?: string } | null)?.industry ?? null;
  return NextResponse.json({ industry });
}
