"use client";

// components/billing/TrialBanner.tsx
//
// Shows a banner when the workspace is on a trial plan. Displays
// days remaining and an upgrade CTA. Fetches workspace status from
// /api/me/workspace and renders only if plan_status is "trialing".

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, ArrowRight } from "lucide-react";

interface TrialInfo {
  plan_status: string;
  trial_ends_at: string | null;
}

export default function TrialBanner() {
  const [trial, setTrial] = useState<TrialInfo | null>(null);

  useEffect(() => {
    fetch("/api/me/workspace", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.plan_status === "trialing" && data?.trial_ends_at) {
          setTrial({
            plan_status: data.plan_status,
            trial_ends_at: data.trial_ends_at,
          });
        }
      })
      .catch(() => {});
  }, []);

  if (!trial) return null;

  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(trial.trial_ends_at!).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24),
    ),
  );

  const urgent = daysLeft <= 3;

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
      style={{
        background: urgent ? "var(--danger-soft)" : "var(--accent-soft, rgba(59,130,246,0.08))",
        borderBottom: `1px solid ${urgent ? "var(--danger)" : "var(--accent)"}`,
        color: urgent ? "var(--danger)" : "var(--accent)",
      }}
    >
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
        <span>
          {daysLeft === 0
            ? "Your trial expires today."
            : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left on your free trial.`}
        </span>
      </div>
      <Link
        href="/settings#billing"
        className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap hover:underline underline-offset-2"
      >
        Upgrade now
        <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
