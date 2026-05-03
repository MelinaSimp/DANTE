"use client";

// lib/industry/use-industry.ts
//
// Phase 4 W4.5 — workspace industry hook for client components.
//
// Empty states, copy variations, and conditional realtor surfaces
// need to know which vertical a workspace is. Server components
// already have this via getIndustryConfig(workspace?.industry);
// client components either had to thread it as a prop through
// every layer or refetch in every component. This hook centralizes
// that — a single React Query that backs every consumer.

import { useQuery } from "@tanstack/react-query";

export type Industry = "financial_advisor" | "real_estate";

interface WhoamiResponse {
  user?: { id?: string };
  profile?: { workspace_id?: string } | null;
}

interface WorkspaceIndustryResponse {
  industry: Industry | null;
}

async function fetchIndustry(): Promise<Industry | null> {
  // Two hops: first whoami to confirm auth + get workspace id,
  // then a tiny industry endpoint that doesn't require a workspace
  // body parameter (RLS scopes it). Cached for 5 minutes — industry
  // never changes during a session.
  const whoami = await fetch("/api/auth/whoami", { credentials: "include" });
  if (!whoami.ok) return null;
  const w = (await whoami.json()) as WhoamiResponse;
  if (!w.profile?.workspace_id) return null;

  const res = await fetch("/api/workspace/industry", { credentials: "include" });
  if (!res.ok) return null;
  const json = (await res.json()) as WorkspaceIndustryResponse;
  return json.industry ?? null;
}

export function useIndustry() {
  return useQuery<Industry | null>({
    queryKey: ["workspace", "industry"],
    queryFn: fetchIndustry,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** Convenience: returns true when the current workspace is real_estate.
 *  Defaults to false during loading so the advisor surface (the
 *  default) renders without flicker. */
export function useIsRealtor(): boolean {
  const { data } = useIndustry();
  return data === "real_estate";
}
