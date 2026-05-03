// Harvey-styled advisor hub — the default landing after login.
// Legacy analytics dashboard moved to /dashboard/legacy (now a redirect).
//
// Phase 3+ — migrated to TanStack Query. Nav-back to this page no
// longer re-fetches /api/dashboard/advisor while the cache is fresh
// (30s by default; tuned per lib/query/provider.tsx). User-perceived
// latency on second-visit drops from "Tetris loader → render" to
// "instant render → background refresh → re-render with new data."

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import AdvisorDashboard from "@/components/dashboard/AdvisorDashboard";
import TetrisLoading from "@/components/ui/tetris-loader";

type DashboardData = React.ComponentProps<typeof AdvisorDashboard>["data"];

async function fetchAdvisorDashboard(): Promise<DashboardData> {
  const res = await fetch("/api/dashboard/advisor", {
    credentials: "include",
  });
  if (res.status === 401) {
    // Caller branches on this — don't retry-loop on auth failure.
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  }
  if (!res.ok) throw new Error("Failed to load");
  return (await res.json()) as DashboardData;
}

export default function DashboardPage() {
  const router = useRouter();

  // Auth guard runs once on mount; React Query handles the data.
  // We don't want auth state in the cache key — it's the same
  // dashboard for the same user, and 401 short-circuits before
  // useQuery reads anything cacheable.
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/auth");
    })();
  }, [router]);

  const { data, error, isLoading } = useQuery<DashboardData, Error>({
    queryKey: ["dashboard", "advisor"],
    queryFn: fetchAdvisorDashboard,
    // Don't retry on auth failure — let the effect above redirect.
    retry: (failureCount, err) => {
      if ((err as { status?: number }).status === 401) return false;
      return failureCount < 1;
    },
  });

  // Auth-failure: the redirect effect handles it; render nothing in
  // the meantime so we don't flash an error message that's stale.
  if (error && (error as { status?: number }).status === 401) {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center px-6">
        <div className="text-center">
          <p className="prose-body text-[var(--ink-muted)] mb-4">
            Couldn&apos;t load your dashboard.
          </p>
          <button
            onClick={() => location.reload()}
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center">
        <TetrisLoading size="sm" speed="fast" />
      </div>
    );
  }

  return <AdvisorDashboard data={data} />;
}
