// Harvey-styled advisor hub — the default landing after login.
// Legacy analytics dashboard moved to /dashboard/legacy.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import AdvisorDashboard from "@/components/dashboard/AdvisorDashboard";
import TetrisLoading from "@/components/ui/tetris-loader";

type DashboardData = React.ComponentProps<typeof AdvisorDashboard>["data"];

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth");
        return;
      }
      try {
        const res = await fetch("/api/dashboard/advisor", {
          credentials: "include",
        });
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/auth");
            return;
          }
          throw new Error("Failed to load");
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Couldn't load your dashboard.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <p className="prose-body text-[var(--ink-muted)] mb-4">{error}</p>
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

  if (!data) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <TetrisLoading size="sm" speed="fast" />
      </div>
    );
  }

  return <AdvisorDashboard data={data} />;
}
