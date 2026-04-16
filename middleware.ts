import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

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

  // Protected routes that require authentication
  const protectedRoutes = ["/app", "/admin", "/frontend", "/home", "/select", "/superadmin", "/schedule", "/client-details-overview", "/gigaai", "/dashboard", "/settings", "/contacts", "/calls", "/appointments", "/agents"];
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  // Check authentication for protected routes
  if (isProtectedRoute || pathname === "/") {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // User is not signed in - redirect to auth
      return NextResponse.redirect(new URL("/auth", req.url));
    }

    // For root path, let the page component handle the redirect
    if (pathname === "/") {
      return response;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|brand/|downloads/|monitoring).*)"],
};
