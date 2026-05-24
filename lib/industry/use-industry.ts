"use client";

// lib/industry/use-industry.ts
//
// CRE-only. Always returns "real_estate". Kept as a hook so
// existing call sites don't break. No network request needed.

export type Industry = "real_estate";

export function useIndustry() {
  return { data: "real_estate" as const, isLoading: false, error: null };
}

export function useIsRealtor(): boolean {
  return true;
}
