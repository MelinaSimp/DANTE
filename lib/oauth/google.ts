// lib/oauth/google.ts
//
// Google OAuth 2.0 helper, shared by Gmail and Calendar. We grant
// both scopes in one consent screen — when the advisor clicks
// "Connect Google" they get mail-read + calendar-read in one flow,
// and the resulting credential row services both sync jobs.
//
// Security notes:
//   - State param is HMAC of (workspace_id, user_id, nonce) with a
//     server secret, so the callback can verify the user who started
//     the flow is the user finishing it.
//   - We persist refresh_token but NOT in plaintext-readable form to
//     end users; RLS keeps the row to user_id = auth.uid() and the
//     access_token getter below refreshes lazily so callers never
//     touch refresh_token directly.

import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "node:crypto";
import { encrypt, decrypt } from "./crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  // Gmail — read-only, no compose. We never want to send mail
  // *as* the advisor; outbound stays in our Resend pipeline.
  "https://www.googleapis.com/auth/gmail.readonly",
  // Calendar — read events. Write is a Phase 3+ scope.
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

function clientCreds() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured. Set up an OAuth Client in Google Cloud Console.",
    );
  }
  return { clientId, clientSecret };
}

function appUrl() {
  // Trim and strip trailing slashes defensively — Vercel's env editor
  // has historically preserved trailing whitespace on paste, and a
  // single stray space here breaks every OAuth flow with an opaque
  // "invalid_request" from Google. Better to normalize than debug.
  const raw = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.trim().replace(/\/+$/, "");
}

function redirectUri() {
  return `${appUrl()}/api/oauth/google/callback`;
}

function stateSecret() {
  // Reuse the auth signing secret if we have one; otherwise fall
  // back to the service role key (always present). We only need a
  // server-side HMAC key — value rotates with the deploy, which is
  // fine because OAuth flows complete in seconds.
  return process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "drift-fallback-secret";
}

interface StatePayload {
  w: string;   // workspace_id
  u: string;   // user_id
  n: string;   // nonce
  t: number;   // issued-at unix ms
}

function signState(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyState(token: string): StatePayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    // Reject if the state is more than 10 minutes old — OAuth flows
    // shouldn't take longer than that, and an attacker replaying an
    // old state is the threat we're guarding against.
    if (Date.now() - payload.t > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildAuthUrl(workspaceId: string, userId: string, scopes: readonly string[] = GOOGLE_SCOPES): string {
  const { clientId } = clientCreds();
  const state = signState({
    w: workspaceId,
    u: userId,
    n: crypto.randomBytes(8).toString("hex"),
    t: Date.now(),
  });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: scopes.join(" "),
    // Force a refresh token by demanding offline access + a forced
    // consent prompt. Google only emits refresh_token on the FIRST
    // consent unless we explicitly re-prompt.
    access_type: "offline",
    prompt: "consent",
    state,
    include_granted_scopes: "true",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = clientCreds();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) throw new Error(`Google token exchange ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = clientCreds();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) throw new Error(`Google token refresh ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as TokenResponse;
}

interface UserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo ${res.status}`);
  return (await res.json()) as UserInfo;
}

export async function persistCredential(input: {
  workspaceId: string;
  userId: string;
  tokens: TokenResponse;
  userInfo: UserInfo;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + (input.tokens.expires_in - 60) * 1000); // 60s slack
  const { error } = await supabaseAdmin
    .from("oauth_credentials")
    .upsert(
      {
        workspace_id: input.workspaceId,
        user_id: input.userId,
        provider: "google",
        scopes: input.tokens.scope.split(" "),
        access_token: encrypt(input.tokens.access_token),
        // Google only emits refresh_token on the first consent.
        // Preserve the existing one if this refresh response omits it.
        ...(input.tokens.refresh_token ? { refresh_token: encrypt(input.tokens.refresh_token) } : {}),
        expires_at: expiresAt.toISOString(),
        provider_subject: input.userInfo.sub,
        provider_email: input.userInfo.email,
        meta: { token_type: input.tokens.token_type },
      },
      { onConflict: "workspace_id,user_id,provider" },
    );
  if (error) throw new Error(`persistCredential: ${error.message}`);
}

/**
 * Get a valid access token for a workspace user, refreshing if it's
 * within 60s of expiry. Sync jobs call this before every API request
 * and don't bother caching — refresh is cheap relative to the actual
 * Gmail/Calendar fetch.
 */
export async function getValidAccessToken(workspaceId: string, userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("oauth_credentials")
    .select("access_token, refresh_token, expires_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (error || !data) throw new Error("No Google credential for this user");

  const expiresAt = data.expires_at ? new Date(data.expires_at as string).getTime() : 0;
  const fresh = expiresAt - Date.now() > 60_000;
  if (fresh) return decrypt(data.access_token as string);

  if (!data.refresh_token) throw new Error("Google credential expired with no refresh_token");
  const refreshed = await refreshAccessToken(decrypt(data.refresh_token as string));
  const newExpires = new Date(Date.now() + (refreshed.expires_in - 60) * 1000);
  await supabaseAdmin
    .from("oauth_credentials")
    .update({
      access_token: encrypt(refreshed.access_token),
      // Lazily migrate any pre-encryption row to the encrypted shape.
      refresh_token: encrypt(decrypt(data.refresh_token as string)),
      expires_at: newExpires.toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("provider", "google");
  return refreshed.access_token;
}

export { signState, verifyState };
