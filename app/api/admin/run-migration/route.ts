import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

export async function POST() {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await sb.from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: string[] = [];

  const { error: e1 } = await supabaseAdmin.rpc("exec_sql", {
    sql: "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_amount INTEGER DEFAULT 0"
  }).maybeSingle();

  if (e1) {
    const { error: e1b } = await supabaseAdmin.from("workspaces").select("billing_amount").limit(1);
    if (e1b) {
      results.push(`billing_amount: could not add (${e1.message})`);
    } else {
      results.push("billing_amount: already exists");
    }
  } else {
    results.push("billing_amount: added");
  }

  const { error: e2 } = await supabaseAdmin.rpc("exec_sql", {
    sql: "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly'"
  }).maybeSingle();

  if (e2) {
    const { error: e2b } = await supabaseAdmin.from("workspaces").select("billing_cycle").limit(1);
    if (e2b) {
      results.push(`billing_cycle: could not add (${e2.message})`);
    } else {
      results.push("billing_cycle: already exists");
    }
  } else {
    results.push("billing_cycle: added");
  }

  return NextResponse.json({ results });
}
