import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

/**
 * Proxy PDF from Supabase Storage to avoid CORS when loading in pdf.js (browser).
 * GET /api/documents/proxy-pdf?url=<encoded-signed-url>
 *
 * Only allows URLs from our Supabase storage bucket.
 */
export async function GET(req: NextRequest) {
  try {
    const urlParam = req.nextUrl.searchParams.get("url");
    if (!urlParam) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(decodeURIComponent(urlParam));
    } catch {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    // Only allow our Supabase storage URLs (signed URLs use /storage/v1/object/sign/...)
    const allowedPrefix = SUPABASE_URL.replace(/\/$/, "") + "/storage/";
    if (!targetUrl.href.startsWith(allowedPrefix)) {
      return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
    }

    const res = await fetch(targetUrl.href, {
      headers: { Accept: "application/pdf" },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch PDF" },
        { status: res.status }
      );
    }

    const contentType = res.headers.get("content-type") || "application/pdf";
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Proxy PDF error:", error);
    return NextResponse.json(
      { error: "Failed to proxy PDF" },
      { status: 500 }
    );
  }
}
