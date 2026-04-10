import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { testSend } from "@/lib/automations";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { channel, recipient, message } = body;

  if (!channel || !recipient || !message) {
    return NextResponse.json({ error: "channel, recipient, and message are required" }, { status: 400 });
  }

  const result = await testSend(channel, recipient, message);
  if (result.success) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: result.error }, { status: 500 });
}
