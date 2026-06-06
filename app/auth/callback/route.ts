// app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Returns the workspace_id the user should land in, or null if they
// still need to redeem a code on /join.
async function ensureUserWorkspace(user: any, supabase: any): Promise<string | null> {
  const userId = user.id;
  const userEmail = user.email || "user@example.com";
  const meta = user.user_metadata || {};
  const firstName = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  const lastName = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
  const companyName = typeof meta.company_name === "string" ? meta.company_name.trim() : "";
  const companyCategory =
    typeof meta.company_category === "string" ? meta.company_category.trim() : null;
  const pendingCode =
    typeof meta.pending_workspace_code === "string"
      ? meta.pending_workspace_code.trim().toUpperCase()
      : "";
  const pendingIndustry = "real_estate" as const;
  const computedFullName = `${firstName} ${lastName}`.trim() || userEmail.split("@")[0];

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", userId)
    .maybeSingle();

  if (existingProfile?.workspace_id) {
    const update: Record<string, any> = {
      id: userId,
      full_name: computedFullName,
      role: "owner",
      workspace_id: existingProfile.workspace_id,
    };
    if (firstName) update.first_name = firstName;
    if (lastName) update.last_name = lastName;
    if (companyCategory) update.company_category = companyCategory;
    await supabase.from("profiles").upsert(update);

    // Update workspace name if company name is provided
    if (companyName) {
      await supabase
        .from("workspaces")
        .update({ name: companyName })
        .eq("id", existingProfile.workspace_id);
    }
    return existingProfile.workspace_id;
  }

  // No workspace yet. If the user supplied a pending workspace code on
  // signup (stashed in user_metadata by /auth), redeem it now so they
  // land straight in the right workspace instead of bouncing through
  // /join.
  let redeemedWorkspaceId: string | null = null;
  if (pendingCode) {
    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("id")
      .eq("invite_code", pendingCode)
      .maybeSingle();
    if (workspace?.id) {
      redeemedWorkspaceId = workspace.id;
      // Stamp the workspace's industry from the user's pick on signup.
      // Only the first redeemer's choice sticks — subsequent joiners
      // join the workspace already configured for that vertical.
      if (pendingIndustry) {
        try {
          await supabaseAdmin
            .from("workspaces")
            .update({ industry: pendingIndustry })
            .eq("id", workspace.id);
        } catch {
          // Non-fatal: the workspace just stays on whatever it was.
        }
      }
      // Clear the stashed code + industry — single-use per signup.
      try {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...meta,
            pending_workspace_code: null,
            pending_industry: null,
          },
        });
      } catch {
        // Non-fatal: the code just lingers in metadata, no harm done.
      }
    }
  }

  const pendingProfile: Record<string, any> = {
    id: userId,
    full_name: computedFullName,
    role: "member",
    is_superadmin: false,
    workspace_id: redeemedWorkspaceId,
  };
  if (firstName) pendingProfile.first_name = firstName;
  if (lastName) pendingProfile.last_name = lastName;
  if (companyCategory) pendingProfile.company_category = companyCategory;
  await supabase.from("profiles").upsert(pendingProfile);

  return redeemedWorkspaceId;
}

// Decides where a just-authenticated user should land.
//
//   • no workspace yet  → /join (redeem a code or start trial)
//   • workspace, not yet onboarded  → /onboarding (first-run wizard)
//   • workspace, onboarded  → /dashboard
//
// The pending_trial flag in user_metadata indicates the user chose
// "Start free trial" during signup instead of entering a workspace
// code. The /join page detects this and auto-provisions a trial
// workspace.
async function resolveLandingRoute(workspaceId: string | null): Promise<string> {
  if (!workspaceId) return "/join";
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("onboarded_at")
    .eq("id", workspaceId)
    .maybeSingle();
  return ws?.onboarded_at ? "/home" : "/onboarding";
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const supabase = await createServerSupabase();

  if (code) {
    // OAuth callback - establish session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error("OAuth callback error:", error);
      return NextResponse.redirect(new URL("/auth?error=oauth_error", requestUrl.origin));
    }
    
    if (data.session && data.user) {
      const workspaceId = await ensureUserWorkspace(data.user, supabase);
      const target = await resolveLandingRoute(workspaceId);
      return NextResponse.redirect(new URL(target, requestUrl.origin));
    }
  }

  // For direct sign-ins, check if we have a user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const workspaceId = await ensureUserWorkspace(user, supabase);
    const target = await resolveLandingRoute(workspaceId);
    return NextResponse.redirect(new URL(target, requestUrl.origin));
  }

  // No user found, redirect to auth page
  return NextResponse.redirect(new URL("/auth", requestUrl.origin));
}