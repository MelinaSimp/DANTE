// lib/twilio.ts
//
// Centralised helper for loading a workspace's Twilio client. Auth
// tokens are stored encrypted in `twilio_credentials.auth_token`;
// decryption happens here so every caller gets a ready-to-use client
// and the plaintext token never escapes this module unnecessarily.
//
// Legacy plaintext rows (pre-encryption rollout) are handled
// transparently by decryptSecret(). We also lazily re-encrypt them
// on first read via supabaseAdmin so the migration tail shortens
// without a separate backfill script.

import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import twilio from "twilio";
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
  reencryptInBackground,
} from "@/lib/crypto/secrets";

export interface TwilioCreds {
  account_sid: string;
  auth_token: string;
}

export async function getWorkspaceTwilio(workspaceId: string) {
  const supabase = await createServerSupabase();
  const { data: row, error } = await supabase
    .from("twilio_credentials")
    .select("account_sid, auth_token")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!row) return null;

  const authToken = decryptSecret(row.auth_token);
  if (!authToken) return null;

  // If the stored token wasn't encrypted, upgrade it in the background.
  // This catches rows written before the encryption rollout as they
  // get accessed, which is cheaper than a big-bang backfill.
  if (!isEncrypted(row.auth_token)) {
    void reencryptInBackground("twilio_credentials.auth_token", async () => {
      const upgraded = encryptSecret(authToken);
      await supabaseAdmin
        .from("twilio_credentials")
        .update({ auth_token: upgraded })
        .eq("workspace_id", workspaceId);
    });
  }

  const client = twilio(row.account_sid, authToken);
  const creds: TwilioCreds = {
    account_sid: row.account_sid,
    auth_token: authToken,
  };
  return { client, creds } as { client: ReturnType<typeof twilio>; creds: TwilioCreds };
}
