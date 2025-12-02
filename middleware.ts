import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Always pass API routes straight through
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // ✅ Always pass auth routes straight through (including callback)
  if (pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // Create response for cookie handling
  const response = NextResponse.next();
  
  // Create Supabase client with proper cookie handling
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          // Set cookie with proper domain and path
          response.cookies.set({
            name,
            value,
            ...options,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          });
        },
        remove(name: string, options: any) {
          response.cookies.set({
            name,
            value: "",
            ...options,
            maxAge: 0,
          });
        },
      },
    }
  );

  // Handle root path redirect
  if (pathname === "/") {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // User is signed in - let the page component handle the redirect
      return response;
    } else {
      // User is not signed in - redirect to auth
      return NextResponse.redirect(new URL("/auth", req.url));
    }
  }

  return response;
}

export const config = {
  // Run everywhere so the early /api check always applies
  matcher: ["/:path*"],
};
