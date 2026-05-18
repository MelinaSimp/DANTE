import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ parcelId: string }> },
) {
  const { parcelId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // Verify parcel belongs to workspace
  const { data: parcel } = await supabaseAdmin
    .from("parcels")
    .select("id")
    .eq("id", parcelId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!parcel) {
    return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const documentId = body.document_id;
  if (!documentId) {
    return NextResponse.json(
      { error: "document_id required" },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from("parcel_documents")
    .upsert(
      { parcel_id: parcelId, document_id: documentId },
      { onConflict: "parcel_id,document_id" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
