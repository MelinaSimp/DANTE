import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { handleSiteScanDetail } from "@/lib/site-scan/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
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

  // Look up parcel to get identifiers
  const { data: parcel } = await supabaseAdmin
    .from("parcels")
    .select("parcel_number, county, state")
    .eq("id", parcelId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!parcel) {
    return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
  }

  const result = await handleSiteScanDetail(
    {
      parcel_number: parcel.parcel_number,
      county: parcel.county,
      state: parcel.state,
    },
    profile.workspace_id,
  );

  return NextResponse.json(JSON.parse(result));
}
