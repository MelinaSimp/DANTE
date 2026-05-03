"use client";

// app/settings/billing/BillingClient.tsx
//
// Per-workspace pricing display. Drift bills enterprise-style —
// every customer has a negotiated rate assigned by the sales /
// admin team. This view shows:
//
//   1. The workspace's assigned plan (if any) — label + price.
//   2. A "Subscribe" button when stripe_price_id is set but no
//      active subscription yet.
//   3. A "Manage" button when subscribed (Stripe portal).
//   4. A "Contact sales" prompt when no price is assigned yet.
//
// Plan tier (starter / pro / enterprise) drives feature gates and
// is shown for transparency, but the dollar amount is whatever the
// negotiation produced.

import { useState } from "react";
import { Mail, Crown, Check } from "lucide-react";

type PlanTier = "starter" | "pro" | "enterprise";

interface Workspace {
  id: string;
  name: string;
  industry: string | null;
  plan_tier: PlanTier;
  plan_seats: number;
  plan_renewed_at: string | null;
  stripe_price_id: string | null;
  stripe_subscription_id: string | null;
  custom_price_cents: number | null;
  custom_plan_label: string | null;
}

const TIER_FEATURES: Record<PlanTier, string[]> = {
  starter: [
    "Citation-grounded chat",
    "AI memory + review queue",
    "Vault (document indexing)",
    "Basic workflows",
  ],
  pro: [
    "Everything in Starter",
    "Advanced workflows + agent nodes",
    "Autonomous agents",
    "Supervisor review queue",
    "MCP integrations",
  ],
  enterprise: [
    "Everything in Pro",
    "SSO / SCIM",
    "BYOK encryption",
    "Compliance audit pack export",
    "Strong-only citation attestation",
    "Public API access",
    "Dedicated customer success",
    "Examiner credentials",
    "E-discovery legal hold",
  ],
};

function formatPrice(cents: number | null): string {
  if (cents == null) return "Custom";
  const dollars = cents / 100;
  if (dollars >= 1000) {
    return `$${dollars.toLocaleString("en-US")}/mo`;
  }
  return `$${dollars.toFixed(2)}/mo`;
}

export default function BillingClient({
  workspace,
  canManage,
}: {
  workspace: Workspace | null;
  canManage: boolean;
  userEmail: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!workspace) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <p className="text-sm text-[var(--ink-muted)]">Workspace not found.</p>
      </div>
    );
  }

  const hasPrice = !!workspace.stripe_price_id;
  const isSubscribed = !!workspace.stripe_subscription_id;
  const features = TIER_FEATURES[workspace.plan_tier];

  const startCheckout = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats: workspace.plan_seats }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "checkout_failed");
        setBusy(false);
        return;
      }
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "checkout_failed");
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-8 py-10">
      <h1 className="font-display text-3xl text-[var(--ink)] mb-2">Billing</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-8">
        {workspace.name} · {workspace.plan_tier.toUpperCase()} plan
      </p>

      {error && (
        <div className="mb-6 p-3 rounded-[4px] border border-amber-300 bg-amber-50 text-amber-800 text-sm">
          {error === "billing_not_configured"
            ? "Billing isn't yet configured for this deployment. Contact your administrator."
            : error === "no_price_assigned"
              ? "No pricing assigned to this workspace yet. Contact sales to set one up."
              : `Couldn't start checkout: ${error}`}
        </div>
      )}

      <div
        className={`rounded-[6px] border p-6 mb-6 ${
          hasPrice
            ? "border-[var(--ink)] bg-[var(--canvas)]"
            : "border-[var(--rule)] bg-[var(--canvas-subtle)]"
        }`}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <Crown className="w-5 h-5 text-[var(--ink-muted)] mb-2" strokeWidth={1.5} />
            <div className="font-display text-2xl text-[var(--ink)] mb-1">
              {workspace.custom_plan_label ?? `${workspace.plan_tier.toUpperCase()} plan`}
            </div>
            <div className="text-sm text-[var(--ink-muted)]">
              {hasPrice ? (
                <>
                  <span className="font-mono text-[var(--ink)]">
                    {formatPrice(workspace.custom_price_cents)}
                  </span>
                  {workspace.plan_seats > 1 && ` · ${workspace.plan_seats} seats`}
                </>
              ) : (
                "No pricing assigned yet"
              )}
            </div>
          </div>
          <div className="text-right text-xs text-[var(--ink-subtle)]">
            {isSubscribed ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Check className="w-3 h-3" strokeWidth={2} />
                Active subscription
              </span>
            ) : hasPrice ? (
              <span className="text-amber-700">Ready to subscribe</span>
            ) : (
              <span>Awaiting setup</span>
            )}
            {workspace.plan_renewed_at && (
              <div className="mt-1">
                Last renewed {new Date(workspace.plan_renewed_at).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        <ul className="space-y-1.5 mb-5">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-1.5 text-xs text-[var(--ink-muted)]">
              <Check className="w-3 h-3 mt-0.5 text-emerald-600 flex-shrink-0" strokeWidth={2} />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {canManage && hasPrice && !isSubscribed && (
          <button
            onClick={startCheckout}
            disabled={busy}
            className="w-full px-3 py-2.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {busy ? "Redirecting…" : `Subscribe — ${formatPrice(workspace.custom_price_cents)}`}
          </button>
        )}

        {canManage && isSubscribed && (
          <a
            href="https://billing.stripe.com/p/login"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center w-full px-3 py-2.5 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--ink)]/30 transition"
          >
            Manage subscription in Stripe
          </a>
        )}

        {!hasPrice && (
          <a
            href="mailto:sales@driftai.studio"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
          >
            <Mail className="w-4 h-4" strokeWidth={1.5} />
            Contact sales
          </a>
        )}
      </div>

      {!canManage && (
        <p className="text-xs text-[var(--ink-subtle)]">
          Only workspace admins can manage billing.
        </p>
      )}

      <div className="mt-10 text-xs text-[var(--ink-subtle)] leading-relaxed">
        Drift bills enterprise-style — every workspace has a negotiated rate. Pricing reflects
        seat count, vertical, and integration depth. Contact sales to adjust your plan or to
        discuss volume agreements.
      </div>
    </div>
  );
}
