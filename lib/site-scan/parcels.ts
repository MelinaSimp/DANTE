// lib/site-scan/parcels.ts
// Parcel CRUD helpers — upsert and lookup.

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ParcelSummary } from "./adapters/types";

export async function upsertParcel(
  workspaceId: string,
  p: ParcelSummary,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("parcels")
    .upsert(
      {
        workspace_id: workspaceId,
        parcel_number: p.parcel_number,
        county: p.county,
        state: p.state,
        address: p.address,
        city: p.city,
        centroid: `SRID=4326;POINT(${p.centroid.lng} ${p.centroid.lat})`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,parcel_number,county,state" },
    )
    .select("id")
    .single();

  if (error) {
    console.warn("[parcels] upsert failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function findParcel(
  workspaceId: string,
  parcelNumber: string,
  county: string,
  state: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("parcels")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("parcel_number", parcelNumber)
    .eq("county", county)
    .eq("state", state)
    .maybeSingle();

  return data?.id ?? null;
}
