import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Always pass API routes straight through
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // … your existing auth/onboarding checks go here …
  return NextResponse.next();
}

export const config = {
  // Run everywhere so the early /api check always applies
  matcher: ["/:path*"],
};
