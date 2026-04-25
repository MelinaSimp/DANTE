// lib/oauth/microsoft.ts
//
// Microsoft Graph OAuth 2.0 helper. Mirrors lib/oauth/google.ts —
// one consent grants both Mail.Read and Calendars.Read so a single
// "Connect Microsoft" click services the Outlook + MS Calendar
// sync jobs.
//
// Tenant: we use "common" so both consumer (outlook.com / hotmail)
// and work/school accounts can connect without tenant-specific
// configuration. If an advisor's IT requires single-tenant, the
// MICROSOFT_TENANT_ID env override switches to that tenant.

import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "node:crypto";
import { encrypt, decrypt } from "./crypto";

function tenantId() {
  return process.env.MICROSOFT_TENANT_ID || "common";
}
function authBaseUrl() {
  return `https://login.microsoftonline.com/${tenantId()}/oauth2/v2.0`;
}

export const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",                      // required to get a refresh_token
  "Mail.Read",
  "Calendars.Read",
  "User.Read",
] as const;

function clientCreds() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not configured. Register an app in Azure Portal → App registrations.",
    );
  }
  return { clientId, clientSecret };
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
function redirectUri() {
  return `${appUrl()}/api/oauth/microsoft/callback`;
}
function stateSecret() {
  return process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "drift-fallback-secret";
}

interface StatePayload {
  w: string;
  u: string;
  n: string;
  t: number;
}

function signState(p: StatePayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(token: string): StatePayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    if (Date.now() - p.t > 10 * 60 * 1000) return null;
    return p;
  } catch {
    return null;
  }
}

export function buildAuthUrl(workspaceId: string, userId: string): string {
  const { clientId } = clientCreds();
  const state = signState({
    w: workspaceId,
    u: userId,
    n: crypto.randomBytes(8).toString("hex"),
    t: Date.now(),
  });
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    state,
    prompt: "consent",
  });
  return `${authBaseUrl()}/authorize?${params.toString()}`;
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
  const res = await fetch(`${authBaseUrl()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      scope: MICROSOFT_SCOPES.join(" "),
    }).toString(),
  });
  if (!res.ok) throw new Error(`Microsoft token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = clientCreds();
  const res = await fetch(`${authBaseUrl()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: MICROSOFT_SCOPES.join(" "),
    }).toString(),
  });
  if (!res.ok) throw new Error(`Microsoft refresh ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as TokenResponse;
}

interface UserInfo {
  id: string;
  userPrincipalName?: string;
  mail?: string;
  displayName?: string;
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Microsoft me ${res.status}`);
  return (await res.json()) as UserInfo;
}

export async function persistCredential(input: {
  workspaceId: string;
  userId: string;
  tokens: TokenResponse;
  userInfo: UserInfo;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + (input.tokens.expires_in - 60) * 1000);
  const email = input.userInfo.mail || input.userInfo.userPrincipalName || null;
  const { error } = await supabaseAdmin
    .from("oauth_credentials")
    .upsert(
      {
        workspace_id: input.workspaceId,
        user_id: input.userId,
        provider: "microsoft",
        scopes: input.tokens.scope.split(" "),
        access_token: encrypt(input.tokens.access_token),
        ...(input.tokens.refresh_token ? { refresh_token: encrypt(input.tokens.refresh_token) } : {}),
        expires_at: expiresAt.toISOString(),
        provider_subject: input.userInfo.id,
        provider_email: email,
        meta: { token_type: input.tokens.token_type },
      },
      { onConflict: "workspace_id,user_id,provider" },
    );
  if (error) throw new Error(`persistCredential: ${error.message}`);
}

export async function getValidAccessToken(workspaceId: string, userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("oauth_credentials")
    .select("access_token, refresh_token, expires_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("provider", "microsoft")
    .maybeSingle();
  if (error || !data) throw new Error("No Microsoft credential for this user");

  const expiresAt = data.expires_at ? new Date(data.expires_at as string).getTime() : 0;
  const fresh = expiresAt - Date.now() > 60_000;
  if (fresh) return decrypt(data.access_token as string);

  if (!data.refresh_token) throw new Error("Microsoft credential expired with no refresh_token");
  const refreshed = await refreshAccessToken(decrypt(data.refresh_token as string));
  const newExpires = new Date(Date.now() + (refreshed.expires_in - 60) * 1000);
  await supabaseAdmin
    .from("oauth_credentials")
    .update({
      access_token: encrypt(refreshed.access_token),
      // Microsoft rotates refresh tokens — use the new one if provided.
      ...(refreshed.refresh_token
        ? { refresh_token: encrypt(refreshed.refresh_token) }
        : { refresh_token: encrypt(decrypt(data.refresh_token as string)) }),
      expires_at: newExpires.toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("provider", "microsoft");
  return refreshed.access_token;
}
