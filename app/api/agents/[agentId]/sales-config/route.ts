import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentId } = await params;

  const { data, error } = await supabaseAdmin
    .from("sales_config")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || { sales_script: "", phone_numbers: [] });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentId } = await params;
  const body = await req.json();
  const { sales_script, phone_numbers } = body;

  const { data, error } = await supabaseAdmin
    .from("sales_config")
    .upsert(
      { agent_id: agentId, sales_script: sales_script || "", phone_numbers: phone_numbers || [] },
      { onConflict: "agent_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
