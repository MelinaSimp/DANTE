"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Loader2, Activity, ArrowUpRight } from "lucide-react";
import TetrisLoading from "@/components/ui/tetris-loader";

interface BillingState {
  priceCents: number | null;
  interval: "month" | "year";
  planStatus: string;
  hasSubscription: boolean;
  workspaceName: string | null;
}

export default function BillingCard() {
  const [state, setState] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetch("/api/me/billing", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setState(d))
      .catch(() => setState(null))
      .finally(() => setFetching(false));
  }, []);

  const openPortal = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const { url } = await res.json();
        if (url) window.location.href = url;
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const subscribe = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Could not start checkout");
      }
    } catch {
      alert("Network error");
    } finally {
      setLoading(false);
    }
  };

  const priceDollars =
    state?.priceCents && state.priceCents > 0
      ? (state.priceCents / 100).toFixed(2)
      : null;
  const intervalLabel = state?.interval === "year" ? "year" : "month";

  const showSubscribe = state && !state.hasSubscription;

  return (
    <div className="card-flat p-6">
      <div className="label-section mb-2">Account</div>
      <h2 className="heading-display text-2xl text-[var(--ink)] mb-2">
        Billing &amp; subscription
      </h2>

      {fetching ? (
        <div className="flex items-center justify-center py-8">
          <TetrisLoading size="sm" speed="fast" />
        </div>
      ) : showSubscribe ? (
        <>
          {priceDollars ? (
            <p className="text-sm text-[var(--ink-muted)] mb-2">
              Your plan:{" "}
              <span className="text-[var(--ink)] font-medium">
                ${priceDollars} / {intervalLabel}
              </span>
            </p>
          ) : (
            <p className="text-sm text-[var(--ink-muted)] mb-2">
              Your plan is being set up. Please contact support to activate
              billing for your workspace.
            </p>
          )}
          <p className="text-sm text-[var(--ink-muted)] mb-6">
            You'll be redirected to Stripe to enter your card details. Your
            subscription renews {intervalLabel}ly; cancel anytime.
          </p>
          <button
            onClick={subscribe}
            disabled={loading || !priceDollars}
            className="inline-flex items-center gap-2 bg-[var(--ink)] text-[var(--canvas)] px-4 py-2 rounded-[4px] text-sm font-medium hover:bg-[var(--ink)]/90 transition disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <CreditCard className="h-4 w-4" strokeWidth={1.5} />
            )}
            Subscribe
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--ink-muted)] mb-6">
            Manage your subscription, update payment methods, and view invoices
            through the billing portal.
          </p>
          <button
            onClick={openPortal}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-[var(--ink)] text-[var(--canvas)] px-4 py-2 rounded-[4px] text-sm font-medium hover:bg-[var(--ink)]/90 transition disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <CreditCard className="h-4 w-4" strokeWidth={1.5} />
            )}
            Manage billing
          </button>
        </>
      )}

      <div className="mt-5 pt-4 border-t border-[var(--rule)]">
        <Link
          href="/settings/usage"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
        >
          <Activity className="w-3.5 h-3.5" strokeWidth={1.5} />
          View usage &amp; cost breakdown
          <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}
