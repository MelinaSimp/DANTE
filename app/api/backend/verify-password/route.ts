import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getBackendPassword(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "backend_password")
      .maybeSingle();
    if (data?.value) return data.value;
  } catch {}
  return process.env.BACKEND_PASSWORD || null;
}

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (!password) {
      return NextResponse.json({ valid: false, error: "Password required" }, { status: 400 });
    }

    const storedPassword = await getBackendPassword();

    if (!storedPassword) {
      return NextResponse.json({ valid: false, error: "Backend password not configured" }, { status: 500 });
    }

    const isValid = password === storedPassword;

    if (isValid) {
      // Set authentication cookie (expires in 24 hours)
      const cookieStore = await cookies();
      cookieStore.set("backend_authenticated", "true", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24, // 24 hours
        path: "/",
      });

      const response = NextResponse.json({ valid: true });
      // Also set cookie in response headers for client-side access
      response.cookies.set("backend_authenticated", "true", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24, // 24 hours
        path: "/",
      });
      return response;
    }

    return NextResponse.json({ valid: false });
  } catch (error: any) {
    console.error("Password verification error:", error);
    return NextResponse.json(
      { valid: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
