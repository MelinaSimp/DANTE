// Server-side helpers for feature entitlement gating.
//
// UI-level hiding of nav links is not enough — an honest business has
// to make sure a workspace that doesn't pay for Dante literally
// cannot load /dante even if someone types the URL. These helpers
// run in server components and route handlers to enforce that.
//
// Pair with /lib/features.ts (the catalog) and /hooks/useFeatures.ts
// (the client mirror).

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEnabledFeatures, type FeatureId } from "@/lib/features";

/**
 * Resolve the effective feature list for a workspace, honouring the
 * "null = grandfather everything" semantics from getEnabledFeatures.
 */
export async function getWorkspaceFeatures(
  workspaceId: string | null | undefined
): Promise<FeatureId[]> {
  if (!workspaceId) return [];
  const { data } = await supabaseAdmin
    .from("workspaces")
    .select("enabled_features")
    .eq("id", workspaceId)
    .maybeSingle();
  return getEnabledFeatures(data?.enabled_features as string[] | null | undefined);
}

export async function hasWorkspaceFeature(
  workspaceId: string | null | undefined,
  feature: FeatureId
): Promise<boolean> {
  const features = await getWorkspaceFeatures(workspaceId);
  return features.includes(feature);
}

/**
 * Enforce access to a feature from a server component. If the
 * workspace isn't entitled, redirect to /home with a `?gated=<id>`
 * marker so the home page can flash a "this feature isn't part of
 * your plan" banner.
 *
 * Never throws; uses Next's redirect() which unwinds rendering.
 */
export async function requireFeature(
  workspaceId: string | null | undefined,
  feature: FeatureId
): Promise<void> {
  const ok = await hasWorkspaceFeature(workspaceId, feature);
  if (!ok) redirect(`/home?gated=${feature}`);
}
