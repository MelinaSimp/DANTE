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
    <div className="rounded-3xl border border-white/10 bg-black/40 p-6 shadow-[0_20px_70px_rgba(8,8,16,0.6)]">
      <p className="text-xs uppercase tracking-[0.35em] text-white/50">Account</p>
      <h2 className="mt-3 text-2xl font-semibold text-white">Billing &amp; Subscription</h2>
      <p className="mt-3 text-sm text-white/60">
        Manage your subscription, update payment methods, and view invoices through the billing
        portal.
      </p>
      <button
        onClick={openPortal}
        disabled={loading}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="h-4 w-4" />
        )}
        Manage Billing
      </button>
    </div>
  );
}
