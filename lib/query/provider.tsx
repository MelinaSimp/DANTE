"use client";

// lib/query/provider.tsx
//
// Phase 3+ — TanStack Query provider. Wraps the app so any client
// component can use useQuery / useMutation with shared cache.
//
// Defaults are tuned for Drift's read patterns:
//   - staleTime: 30s — most dashboards refresh on workspace events,
//     not by re-querying. 30s is short enough that nav-back reads
//     fresh data after a meaningful delay, long enough that
//     clicking around within a minute hits the cache.
//   - gcTime: 5 minutes — keep evicted queries around so a back
//     navigation doesn't refetch from scratch.
//   - refetchOnWindowFocus: true — desktop users tab away to email
//     and come back; we want the dashboard to refresh.
//   - retry: 1 — Supabase RLS errors aren't transient. One retry
//     handles a flaky network hop without masking real failures.
//
// NOTE: this provider is mounted in app/layout.tsx so server
// components above it still render server-side; client children
// get the hooks. The provider itself is a thin client wrapper —
// it doesn't replace SSR data fetching, it complements it.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export default function QueryProvider({ children }: { children: ReactNode }) {
  // useState ensures the client is created once per mount. New
  // QueryClient per render would defeat caching entirely.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
