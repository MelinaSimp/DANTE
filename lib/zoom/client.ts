// Zoom Server-to-Server (S2S) OAuth client.
//
// Each workspace supplies its own Zoom app credentials (account_id +
// client_id + client_secret). We mint short-lived access tokens on
// demand — no refresh flow, no user OAuth handoff. The token TTL is
// ~1 hour; we cache in-memory per workspace for up to 50 minutes to
// avoid re-minting on every request.
//
// Docs:
//   Auth:     https://developers.zoom.us/docs/internal-apps/s2s-oauth/
//   Meetings: https://developers.zoom.us/docs/api/meetings/#tag/meetings
//   Download: cloud recordings need ?access_token=<download_token>

import { supabaseAdmin } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto/secrets";

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

export type ZoomCredentials = {
  account_id: string;
  client_id: string;
  client_secret: string; // decrypted
};

export async function loadZoomCredentials(
  workspaceId: string
): Promise<ZoomCredentials | null> {
  const { data, error } = await supabaseAdmin
    .from("zoom_credentials")
    .select("account_id, client_id, client_secret")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) return null;
  const secret = decryptSecret(data.client_secret);
  if (!secret) return null;
  return {
    account_id: data.account_id,
    client_id: data.client_id,
    client_secret: secret,
  };
}

export async function getAccessToken(workspaceId: string): Promise<string> {
  const cached = tokenCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }
  const creds = await loadZoomCredentials(workspaceId);
  if (!creds) throw new Error("Zoom credentials not configured for this workspace");

  const basic = Buffer.from(
    `${creds.client_id}:${creds.client_secret}`
  ).toString("base64");

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(
      creds.account_id
    )}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zoom token request failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(workspaceId, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
  return data.access_token;
}

/** Fetch the "me" user so we can confirm creds and surface an email in settings. */
export async function fetchZoomUser(workspaceId: string): Promise<{
  email: string | null;
  account_type: string | null;
  plan_type: number | null;
}> {
  const token = await getAccessToken(workspaceId);
  const res = await fetch("https://api.zoom.us/v2/users/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Zoom /users/me failed: ${res.status} ${await res.text()}`);
  }
  const u: any = await res.json();
  return {
    email: u.email ?? null,
    // type: 1=Basic, 2=Licensed (Pro+), 3=On-prem. Cloud recording needs Licensed.
    account_type: u.type === 2 ? "Licensed" : u.type === 1 ? "Basic" : String(u.type ?? "unknown"),
    plan_type: typeof u.type === "number" ? u.type : null,
  };
}

export type CreatedMeeting = {
  id: number;
  uuid: string;
  join_url: string;
  start_url: string;
  password?: string;
};

/**
 * Create an instant meeting with cloud recording forced on.
 * The advisor opens start_url to host; any recording auto-uploads
 * to Zoom's cloud and fires our webhook when it's processed.
 */
export async function createInstantMeeting(
  workspaceId: string,
  topic: string
): Promise<CreatedMeeting> {
  const token = await getAccessToken(workspaceId);
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic,
      type: 1, // instant
      settings: {
        auto_recording: "cloud",
        approval_type: 2, // no registration
        join_before_host: false,
        mute_upon_entry: false,
        waiting_room: false,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Zoom meeting create failed: ${res.status} ${await res.text()}`);
  }
  const m: any = await res.json();
  return {
    id: m.id,
    uuid: m.uuid,
    join_url: m.join_url,
    start_url: m.start_url,
    password: m.password,
  };
}

/**
 * Download a recording file. Zoom requires the event's download_token
 * as either ?access_token= query param OR Authorization: Bearer header.
 * We use the header form — same path as our other fetches.
 */
export async function downloadRecordingFile(
  downloadUrl: string,
  downloadToken: string
): Promise<ArrayBuffer> {
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${downloadToken}` },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(
      `Zoom recording download failed: ${res.status} ${await res.text()}`
    );
  }
  return res.arrayBuffer();
}
