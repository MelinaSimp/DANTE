"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

export default function BillingCard() {
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="card-flat p-6">
      <div className="label-section mb-2">Account</div>
      <h2 className="heading-display text-2xl text-[var(--ink)] mb-2">
        Billing &amp; subscription
      </h2>
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
    </div>
  );
}
