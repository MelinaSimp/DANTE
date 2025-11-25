// lib/twilio.ts
import { createServerSupabase } from "@/lib/supabase/server";
import twilio from "twilio";

export interface TwilioCreds { account_sid: string; auth_token: string }

export async function getWorkspaceTwilio(workspaceId: string) {
  const supabase = await createServerSupabase();
  const { data: creds, error } = await supabase
    .from("twilio_credentials")
    .select("account_sid, auth_token")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!creds) return null;

  const client = twilio(creds.account_sid, creds.auth_token);
  return { client, creds } as { client: ReturnType<typeof twilio>; creds: TwilioCreds };
}
