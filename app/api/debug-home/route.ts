// app/api/debug-home/route.ts
import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { hasSuperadminAccess } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  
  let user = null;
  let profile = null;
  let userError = null;
  let profileError = null;

  try {
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      userError = authError.message;
    } else {
      user = userData.user;
    }

    if (user) {
      const { data: profileData, error: profError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (profError) {
        profileError = profError.message;
      } else {
        profile = profileData;
      }
    }
  } catch (e: any) {
    userError = e.message;
  }

  const isSuperadmin = hasSuperadminAccess(user?.email ?? null, profile?.is_superadmin);

  return NextResponse.json({
    user: user ? { id: user.id, email: user.email } : null,
    userError,
    profile,
    profileError,
    shouldShowDashboard: !!(user && profile && !isSuperadmin),
    shouldRedirectToSuperadmin: !!(user && profile && isSuperadmin),
    shouldShowMarketing: !user,
    timestamp: new Date().toISOString(),
  });
}
