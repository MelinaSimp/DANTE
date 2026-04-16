import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

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
    // Rate limit: 5 attempts per minute per IP
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`backend-pw:${ip}`, 5, 60_000);
    if (!allowed) return rateLimitResponse();

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
