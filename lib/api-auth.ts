import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Authenticate an API request and return the user + their workspace.
 * Returns a NextResponse error if unauthenticated — callers should
 * short-circuit with that response.
 */
export async function requireUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      supabase,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }

  return { user, supabase, error: null } as const;
}

/**
 * Authenticate and also fetch the user's workspace_id.
 */
export async function requireUserWithWorkspace() {
  const result = await requireUser();
  if (result.error) return { ...result, workspaceId: null } as const;

  const { data: profile } = await result.supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", result.user.id)
    .maybeSingle();

  const workspaceId = profile?.workspace_id as string | null;
  return { ...result, workspaceId } as const;
}
