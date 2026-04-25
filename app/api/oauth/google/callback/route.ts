// /api/oauth/google/callback — finish the OAuth handshake.
//
// We:
//   1. Verify the signed state token (workspace + user + nonce + ts).
//   2. Exchange the auth code for tokens.
//   3. Hit /userinfo to grab the Google sub + email.
//   4. Upsert the oauth_credentials row.
//   5. Redirect to /settings with a status flag.

import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, fetchUserInfo, persistCredential, verifyState } from "@/lib/oauth/google";

export const dynamic = "force-dynamic";

function settingsUrl(status: string, message?: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const params = new URLSearchParams({ google_oauth: status });
  if (message) params.set("message", message);
  return `${base}/settings?${params.toString()}`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) return NextResponse.redirect(settingsUrl("error", oauthError));
  if (!code || !state) return NextResponse.redirect(settingsUrl("error", "missing_params"));

  const payload = verifyState(state);
  if (!payload) return NextResponse.redirect(settingsUrl("error", "invalid_state"));

  try {
    const tokens = await exchangeCode(code);
    const userInfo = await fetchUserInfo(tokens.access_token);
    await persistCredential({
      workspaceId: payload.w,
      userId: payload.u,
      tokens,
      userInfo,
    });
    return NextResponse.redirect(settingsUrl("connected"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "exchange_failed";
    return NextResponse.redirect(settingsUrl("error", encodeURIComponent(message)));
  }
}
