import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// Backend password - should be set in environment variable
// Default password for development (change in production!)
const BACKEND_PASSWORD = process.env.BACKEND_PASSWORD || "Adhuvishu1";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (!password) {
      return NextResponse.json({ valid: false, error: "Password required" }, { status: 400 });
    }

    // Compare passwords (in production, use secure comparison)
    const isValid = password === BACKEND_PASSWORD;

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
