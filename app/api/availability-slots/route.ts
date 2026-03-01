import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getWorkspaceId(req: NextRequest): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("workspace_id").eq("id", user.id).maybeSingle();
  return profile?.workspace_id ?? null;
}

// GET — list slots, optionally filtered by date range
export async function GET(req: NextRequest) {
  const workspaceId = await getWorkspaceId(req);
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  let query = supabaseAdmin
    .from("availability_slots")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("slot_date")
    .order("start_time");

  if (startDate) query = query.gte("slot_date", startDate);
  if (endDate) query = query.lte("slot_date", endDate);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST — create a new slot
export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId(req);
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { slot_date, start_time, end_time, notes, slot_type } = body;

  if (!slot_date || !start_time || !end_time) {
    return NextResponse.json({ error: "slot_date, start_time, and end_time are required" }, { status: 400 });
  }

  if (start_time >= end_time) {
    return NextResponse.json({ error: "start_time must be before end_time" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("availability_slots")
    .insert({ workspace_id: workspaceId, slot_date, start_time, end_time, notes, slot_type: slot_type || "General" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE — remove a slot by id (passed as query param)
export async function DELETE(req: NextRequest) {
  const workspaceId = await getWorkspaceId(req);
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const slotId = searchParams.get("id");
  if (!slotId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("availability_slots")
    .delete()
    .eq("id", slotId)
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
