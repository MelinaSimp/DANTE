// app/api/dante/secrets/[secretId]/route.ts
//
// DELETE → remove one secret from the workspace's vault.
// Value updates go through POST on the collection (upsert by key).

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // Delete scoped to this workspace so cross-workspace deletes silently
  // no-op instead of throwing.
  const { error } = await supabaseAdmin
    .from("dante_secrets")
    .delete()
    .eq("id", secretId)
    .eq("workspace_id", profile.workspace_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
