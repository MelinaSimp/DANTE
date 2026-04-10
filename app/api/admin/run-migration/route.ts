import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

const MIGRATION_SQL = `-- Drift CRM Full Migration
-- Paste this entire block into your Supabase SQL Editor and click Run.

-- 1. Helper function for future migrations
CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS void AS $$ BEGIN EXECUTE sql; END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Workspace columns
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_amount INTEGER DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- 3. Automation events (formerly openclaw_events)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'openclaw_events') THEN
    ALTER TABLE openclaw_events RENAME TO automation_events;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS automation_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),
  event_type TEXT NOT NULL,
  direction TEXT DEFAULT 'outbound',
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Sales config (per-agent script + phone numbers)
CREATE TABLE IF NOT EXISTS sales_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  sales_script TEXT DEFAULT '',
  phone_numbers JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Outbound call logs
CREATE TABLE IF NOT EXISTS outbound_call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in-progress',
  duration INTEGER DEFAULT 0,
  summary TEXT DEFAULT '',
  recording_url TEXT,
  transcript JSONB,
  vapi_call_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Sent emails history
CREATE TABLE IF NOT EXISTS sent_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Automation rules
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL,
  condition TEXT DEFAULT '',
  action_description TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);`;

export async function GET() {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await sb.from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return new NextResponse(MIGRATION_SQL, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST() {
  return NextResponse.json({
    message: "Copy the SQL below and paste it into your Supabase SQL Editor.",
    sql: MIGRATION_SQL,
  });
}
