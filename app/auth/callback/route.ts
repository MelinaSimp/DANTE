// app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

async function ensureUserWorkspace(user: any, supabase: any) {
  const userId = user.id;
  const userEmail = user.email || "user@example.com";
  const meta = user.user_metadata || {};
  const firstName = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  const lastName = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
  const companyName = typeof meta.company_name === "string" ? meta.company_name.trim() : "";
  const companyCategory =
    typeof meta.company_category === "string" ? meta.company_category.trim() : null;
  const computedFullName = `${firstName} ${lastName}`.trim() || userEmail.split("@")[0];

  // Check if user already has a profile with workspace
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", userId)
    .single();

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
    return;
  }

  // Create a new workspace for the user
  const workspaceName = companyName || `${userEmail.split('@')[0]}'s Workspace`;
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .insert({
      name: workspaceName,
      owner_id: userId,
    })
    .select()
    .single();

  if (workspaceError) {
    console.error("Workspace creation error:", workspaceError);
    return;
  }

  // Create/update profile with workspace
  const newProfile: Record<string, any> = {
    id: userId,
    full_name: computedFullName,
    role: "owner",
    is_superadmin: false,
    workspace_id: workspace.id,
  };
  if (firstName) newProfile.first_name = firstName;
  if (lastName) newProfile.last_name = lastName;
  if (companyCategory) newProfile.company_category = companyCategory;
  await supabase.from("profiles").upsert(newProfile);
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
      // Ensure user has a workspace and profile
      await ensureUserWorkspace(data.user, supabase);
      
      return NextResponse.redirect(new URL("/select", requestUrl.origin));
    }
  }

  // For direct sign-ins, check if we have a user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Ensure user has a workspace and profile
    await ensureUserWorkspace(user, supabase);
    
    return NextResponse.redirect(new URL("/select", requestUrl.origin));
  }

  // No user found, redirect to auth page
  return NextResponse.redirect(new URL("/auth", requestUrl.origin));
}