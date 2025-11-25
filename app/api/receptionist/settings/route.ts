import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

function sanitizePhone(input: unknown): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return `+${digits}`;
}

async function getWorkspace() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, workspaceId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, workspaceId: profile?.workspace_id ?? null };
}

export async function POST(req: NextRequest) {
  const { supabase, workspaceId } = await getWorkspace();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const greeting = (body.greeting ?? "").toString().trim();
  const farewell = (body.farewell ?? "").toString().trim();

  if (!greeting || !farewell) {
    return NextResponse.json({ error: "Greeting and farewell are required" }, { status: 400 });
  }

  const normalizedNumber = sanitizePhone(body.twilio_phone_number);

  const upsertPayload = {
    workspace_id: workspaceId,
    greeting,
    farewell,
    twilio_phone_number: normalizedNumber,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("receptionist_settings")
    .upsert(upsertPayload, { onConflict: "workspace_id" });

  if (error) {
    console.error("Failed to save receptionist settings", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }

  return NextResponse.json({ success: true, settings: upsertPayload });
}

