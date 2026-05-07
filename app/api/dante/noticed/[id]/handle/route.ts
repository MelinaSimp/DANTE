// Mark a dante_noticed row as handled. Called by the dashboard
// dismiss button. RLS scopes the row to the caller's workspace, so
// no extra ownership check is needed beyond authentication.

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("dante_noticed")
    .update({ handled_at: new Date().toISOString(), handled_by: user.id })
    .eq("id", id)
    .is("handled_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
