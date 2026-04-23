// Proxy downloads for the desktop installer + auto-update metadata.
//
// Our release repo is private, so we can't hand GitHub's public
// /releases/latest/download URLs to end users. Instead, the /download
// page and electron-updater's generic feed both hit this route, which
// uses a server-side PAT to resolve the signed asset URL and 302s the
// user there. The PAT never leaves Vercel.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REPO = "MelinaSimp/drift-crm";

const ALLOWED = new Set([
  "Drift-AI-mac-arm64.dmg",
  "Drift-AI-mac-arm64.dmg.blockmap",
  "Drift-AI-mac-x64.dmg",
  "Drift-AI-mac-x64.dmg.blockmap",
  "Drift-AI-Setup.exe",
  "Drift-AI-Setup.exe.blockmap",
  "latest-mac.yml",
  "latest.yml",
  "latest-linux.yml",
]);

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ filename: string }> }
) {
  const { filename } = await ctx.params;
  if (!ALLOWED.has(filename)) {
    return NextResponse.json({ error: "Unknown file" }, { status: 404 });
  }

  const token = process.env.GITHUB_RELEASE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Download service not configured" },
      { status: 500 }
    );
  }

  const relResp = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "drift-ai-download",
      },
      cache: "no-store",
    }
  );
  if (!relResp.ok) {
    return NextResponse.json(
      { error: "No release available" },
      { status: relResp.status === 404 ? 404 : 502 }
    );
  }
  const release = await relResp.json();
  const asset = (release.assets || []).find(
    (a: { name: string }) => a.name === filename
  );
  if (!asset) {
    return NextResponse.json(
      { error: "Asset not in latest release" },
      { status: 404 }
    );
  }

  // Resolve the signed S3 URL without downloading the body. Passing
  // Accept: application/octet-stream to the asset API returns a 302
  // whose Location is a short-lived signed URL the browser / updater
  // can fetch directly — no bytes go through Vercel.
  const signed = await fetch(asset.url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/octet-stream",
      "User-Agent": "drift-ai-download",
    },
    redirect: "manual",
  });
  const location = signed.headers.get("location");
  if (location) {
    return NextResponse.redirect(location, 302);
  }
  // Fallback: stream the body if GitHub returned it directly (small files).
  if (signed.ok && signed.body) {
    return new NextResponse(signed.body, {
      status: 200,
      headers: {
        "content-type": filename.endsWith(".yml")
          ? "text/yaml; charset=utf-8"
          : "application/octet-stream",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  }
  return NextResponse.json({ error: "Download failed" }, { status: 502 });
}
