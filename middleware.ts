import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Decorative/experimental routes — gated behind a Labs cookie so the
// default product surface stays focused on the workflows that actually
// work (client details, calls, documents, agents). Visitors can opt in
// by appending `?labs=1` to any URL (sets cookie, enables Labs routes)
// or `?labs=0` to opt out. Without the cookie these paths redirect to
// `/dashboard`.
const LABS_ROUTES = ["/compiled"];
const LABS_COOKIE = "drift_labs";

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // Create response for cookie handling
  const response = NextResponse.next();

  // Labs opt-in / opt-out via ?labs=1 / ?labs=0. Works on any route so
  // you can toggle from wherever.
  const labsParam = searchParams.get("labs");
  if (labsParam === "1") {
    response.cookies.set({
      name: LABS_COOKIE,
      value: "1",
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  } else if (labsParam === "0") {
    response.cookies.set({
      name: LABS_COOKIE,
      value: "",
      path: "/",
      maxAge: 0,
    });
  }

  // Gate Labs routes unless cookie was present on the incoming request
  // (or is being set right now via ?labs=1).
  const isLabsRoute = LABS_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  );
  if (isLabsRoute) {
    const hasCookie = req.cookies.get(LABS_COOKIE)?.value === "1";
    if (!hasCookie && labsParam !== "1") {
      const url = req.nextUrl.clone();
      url.pathname = "/home";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

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
  // Note: /agents is a top-level redirect to /dashboard/agents (legacy
  // URL support) — it does not need auth gating here because the
  // redirect target already does. /gigaai has no page.tsx; its
  // components are imported by /app backend panels but the URL itself
  // 404s, so no auth gate needed.
  const protectedRoutes = ["/app", "/admin", "/frontend", "/home", "/select", "/superadmin", "/dashboard", "/settings", "/dante", "/workflows", "/lease-abstractor", "/vault", "/agent", "/site-scan", "/properties", "/contacts", "/review"];
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  // Check authentication for protected routes.
  // Uses getSession() (local JWT read) instead of getUser() (network
  // call to Supabase). This means page loads never depend on Supabase
  // availability — a Supabase outage won't block the entire app.
  // API routes still verify tokens server-side via getUser().
  if (isProtectedRoute || pathname === "/") {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      const target = pathname === "/" ? "/download" : "/auth";
      return NextResponse.redirect(new URL(target, req.url));
    }

    if (pathname === "/") {
      return response;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|brand/|downloads/|monitoring).*)"],
};
