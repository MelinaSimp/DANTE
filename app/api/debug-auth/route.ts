// app/api/debug-auth/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    let profile = null;
    let profileError = null;
    
    if (user) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      
      profile = data;
      profileError = error;
    }

    return NextResponse.json({
      user: user || null,
      userError: userError?.message || null,
      profile: profile || null,
      profileError: profileError?.message || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
