// lib/site-scan/cache.ts
// Parcel cache fetch-or-refresh with TTL per source.

import { supabaseAdmin } from "@/lib/supabase/admin";

interface CacheEntry {
  data: any;
  source_url: string | null;
  fetched_at: string;
  expired: boolean;
}

const TTL_DAYS: Record<string, number> = {
  auditor: 30,
  census: 90,
  epa: 30,
  cra: 90,
  dot: 60,
  crexi: 1,
};

export async function getCachedOrFetch(
  parcelId: string,
  source: string,
  fetchFn: () => Promise<{ data: any; source_url: string }>,
): Promise<CacheEntry> {
  // Check cache
  const { data: cached } = await supabaseAdmin
    .from("parcel_cache")
    .select("data, source_url, fetched_at, expires_at")
    .eq("parcel_id", parcelId)
    .eq("source", source)
    .maybeSingle();

  if (cached && new Date(cached.expires_at) > new Date()) {
    return {
      data: cached.data,
      source_url: cached.source_url,
      fetched_at: cached.fetched_at,
      expired: false,
    };
  }

  // Fetch fresh
  const result = await fetchFn();
  const ttl = TTL_DAYS[source] ?? 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttl);

  await supabaseAdmin
    .from("parcel_cache")
    .upsert(
      {
        parcel_id: parcelId,
        source,
        data: result.data,
        source_url: result.source_url,
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "parcel_id,source" },
    );

  return {
    data: result.data,
    source_url: result.source_url,
    fetched_at: new Date().toISOString(),
    expired: false,
  };
}
