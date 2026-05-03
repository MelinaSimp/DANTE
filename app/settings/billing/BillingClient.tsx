"use client";

// app/settings/billing/BillingClient.tsx
//
// Three tier cards with current-tier highlighted; "Upgrade" CTA
// on higher tiers, "Downgrade" on lower (subject to Stripe rules);
// per-tier feature list pulled from lib/billing/plan-tiers.ts.

import { useState } from "react";
import { Check, Zap, Building2, Crown } from "lucide-react";

type PlanTier = "starter" | "pro" | "enterprise";

interface TierCard {
  tier: PlanTier;
  label: string;
  priceLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  features: string[];
}

const TIERS: TierCard[] = [
  {
    tier: "starter",
    label: "Starter",
    priceLabel: "$300 / month",
    description: "Solo advisors and individual realtors. Chat, memory, vault, basic workflows.",
    icon: Zap,
    features: [
      "Citation-grounded chat",
      "AI memory + review queue",
      "Vault (document indexing)",
      "Basic workflows",
      "1 seat",
    ],
  },
  {
    tier: "pro",
    label: "Pro",
    priceLabel: "$800 / month",
    description: "Small firms. Full workflow engine, autonomous agents, MCP integrations.",
    icon: Building2,
    features: [
      "Everything in Starter",
      "Advanced workflows + agent nodes",
      "Autonomous agents",
      "Supervisor review queue",
      "MCP integrations",
      "Up to 5 seats",
    ],
  },
  {
    tier: "enterprise",
    label: "Enterprise",
    priceLabel: "$1,500+ / seat / month",
    description: "Large RIAs and brokerages. Compliance exports, SSO, BYOK, dedicated CSM.",
    icon: Crown,
    features: [
      "Everything in Pro",
      "SSO / SAML",
      "SCIM provisioning",
      "BYOK encryption",
      "Compliance audit pack export",
      "Strong-only citation attestation",
      "Public API access",
      "Dedicated customer success",
      "Per-seat pricing",
    ],
  },
];

interface Workspace {
  id: string;
  name: string;
  industry: string | null;
  plan_tier: PlanTier;
  plan_seats: number;
  plan_renewed_at: string | null;
}

export default function BillingClient({
  workspace,
  canManage,
  userEmail,
}: {
  workspace: Workspace | null;
  canManage: boolean;
  userEmail: string;
}) {
  const [busy, setBusy] = useState<PlanTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  void userEmail;

  const upgrade = async (tier: PlanTier) => {
    setError(null);
    setBusy(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, seats: tier === "enterprise" ? 1 : undefined }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "checkout_failed");
        setBusy(null);
        return;
      }
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "checkout_failed");
      setBusy(null);
    }
  };

  const currentTier = workspace?.plan_tier ?? "starter";

  return (
    <div className="max-w-5xl mx-auto px-6 md:px-8 py-10">
      <h1 className="font-display text-3xl text-[var(--ink)] mb-2">Billing</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-8">
        {workspace?.name ?? "Your workspace"} is on the{" "}
        <span className="font-medium text-[var(--ink)]">{currentTier.toUpperCase()}</span> plan.
        {workspace?.plan_renewed_at &&
          ` Last renewed ${new Date(workspace.plan_renewed_at).toLocaleDateString()}.`}
      </p>

      {error && (
        <div className="mb-6 p-3 rounded-[4px] border border-amber-300 bg-amber-50 text-amber-800 text-sm">
          {error === "billing_not_configured"
            ? "Billing isn't yet configured for this deployment. Contact your administrator."
            : `Couldn't start checkout: ${error}`}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {TIERS.map((t) => {
          const isCurrent = t.tier === currentTier;
          const Icon = t.icon;
          return (
            <div
              key={t.tier}
              className={`relative rounded-[6px] border p-6 ${
                isCurrent
                  ? "border-[var(--ink)] bg-[var(--canvas)] shadow-sm"
                  : "border-[var(--rule)] bg-[var(--canvas-subtle)]"
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-6 px-2 py-0.5 rounded-full bg-[var(--ink)] text-[var(--canvas)] text-[10px] font-semibold tracking-wider uppercase">
                  Current
                </div>
              )}
              <Icon className="w-5 h-5 text-[var(--ink-muted)] mb-3" strokeWidth={1.5} />
              <div className="font-display text-xl text-[var(--ink)] mb-1">{t.label}</div>
              <div className="text-sm font-mono text-[var(--ink)] mb-3">{t.priceLabel}</div>
              <p className="text-xs text-[var(--ink-muted)] mb-5 leading-relaxed">{t.description}</p>
              <ul className="space-y-1.5 mb-6">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-[var(--ink-muted)]">
                    <Check className="w-3 h-3 mt-0.5 text-emerald-600 flex-shrink-0" strokeWidth={2} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {canManage && !isCurrent && (
                <button
                  onClick={() => upgrade(t.tier)}
                  disabled={busy !== null}
                  className="w-full px-3 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                >
                  {busy === t.tier ? "Redirecting…" : `Switch to ${t.label}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!canManage && (
        <p className="mt-6 text-xs text-[var(--ink-subtle)]">
          Only workspace admins can change the plan. Ask an admin to upgrade or downgrade.
        </p>
      )}
    </div>
  );
}
