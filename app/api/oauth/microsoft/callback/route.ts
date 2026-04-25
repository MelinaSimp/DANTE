import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, fetchUserInfo, persistCredential, verifyState } from "@/lib/oauth/microsoft";

export const dynamic = "force-dynamic";

function settingsUrl(status: string, message?: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const params = new URLSearchParams({ microsoft_oauth: status });
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
    return NextResponse.redirect(
      settingsUrl("error", encodeURIComponent(err instanceof Error ? err.message : "exchange_failed")),
    );
  }
}
