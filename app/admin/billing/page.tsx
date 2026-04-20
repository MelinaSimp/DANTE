"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, X, Eye, EyeOff, Copy, ExternalLink } from "lucide-react";
import { reportError } from "@/lib/report-error";

interface KeyStatus {
  masked: string;
  updated_at: string | null;
  is_set: boolean;
}

export default function BillingSettingsPage() {
  const [settings, setSettings] = useState<Record<string, KeyStatus> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const webhookUrl = "https://driftai.studio/api/stripe/webhook";

  useEffect(() => {
    fetch("/api/admin/settings", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSettings(data))
      .catch(reportError("admin/billing: load settings"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSave = async () => {
    if (!secretKey && !webhookSecret) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (secretKey) body.stripe_secret_key = secretKey;
      if (webhookSecret) body.stripe_webhook_secret = webhookSecret;

      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ type: "success", message: "Stripe keys saved" });
        setSecretKey("");
        setWebhookSecret("");
        const r2 = await fetch("/api/admin/settings", { credentials: "include" });
        if (r2.ok) setSettings(await r2.json());
      } else {
        setToast({ type: "error", message: data.error || "Failed to save" });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  const stripeConnected =
    settings?.stripe_secret_key?.is_set && settings?.stripe_webhook_secret?.is_set;

  const inputClass =
    "w-full px-3 py-2 pr-10 rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] text-sm placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--accent)] transition";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="label-section mb-2">Admin</div>
        <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">Billing settings</h1>
        <p className="text-[var(--ink-muted)] text-sm">
          Connect your Stripe account to manage subscriptions.
        </p>
      </div>

      {/* Connection Status */}
      <div
        className={`card-flat p-4 mb-6 ${
          stripeConnected
            ? "border-[var(--verified)] bg-[var(--verified-soft)]"
            : "border-[var(--flag)] bg-[var(--flag-soft)]"
        }`}
        style={
          stripeConnected
            ? { borderColor: "var(--verified)", background: "var(--verified-soft)" }
            : { borderColor: "var(--flag)", background: "var(--flag-soft)" }
        }
      >
        <div className="flex items-center gap-3">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: stripeConnected ? "var(--verified)" : "var(--flag)",
            }}
          />
          <span
            className="text-sm font-medium"
            style={{ color: stripeConnected ? "var(--verified)" : "var(--flag)" }}
          >
            {stripeConnected ? "Stripe connected" : "Stripe not connected"}
          </span>
        </div>
        {!stripeConnected && (
          <p className="text-[var(--ink-muted)] text-xs mt-2 ml-5">
            Enter your Stripe API keys below to enable billing.
          </p>
        )}
      </div>

      {/* API Keys */}
      <div className="card-flat p-5 space-y-6">
        {/* Secret Key */}
        <div>
          <label className="label-section mb-2 block">Stripe secret key</label>
          {settings?.stripe_secret_key?.is_set && (
            <div className="flex items-center gap-2 mb-2">
              <code className="text-xs text-[var(--ink-muted)] bg-[var(--canvas-subtle)] px-2 py-1 rounded-[4px] mono">
                {settings.stripe_secret_key.masked}
              </code>
              <span className="text-[10px]" style={{ color: "var(--verified)" }}>
                Active
              </span>
            </div>
          )}
          <div className="relative">
            <input
              type={showSecretKey ? "text" : "password"}
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={
                settings?.stripe_secret_key?.is_set ? "Enter new key to replace" : "sk_live_..."
              }
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowSecretKey(!showSecretKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-subtle)] hover:text-[var(--ink)]"
            >
              {showSecretKey ? (
                <EyeOff className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <Eye className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
          </div>
          <p className="text-[11px] text-[var(--ink-subtle)] mt-1.5">
            Find this in Stripe Dashboard &gt; Developers &gt; API Keys.
          </p>
        </div>

        {/* Webhook Secret */}
        <div>
          <label className="label-section mb-2 block">Webhook signing secret</label>
          {settings?.stripe_webhook_secret?.is_set && (
            <div className="flex items-center gap-2 mb-2">
              <code className="text-xs text-[var(--ink-muted)] bg-[var(--canvas-subtle)] px-2 py-1 rounded-[4px] mono">
                {settings.stripe_webhook_secret.masked}
              </code>
              <span className="text-[10px]" style={{ color: "var(--verified)" }}>
                Active
              </span>
            </div>
          )}
          <div className="relative">
            <input
              type={showWebhookSecret ? "text" : "password"}
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={
                settings?.stripe_webhook_secret?.is_set
                  ? "Enter new secret to replace"
                  : "whsec_..."
              }
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowWebhookSecret(!showWebhookSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-subtle)] hover:text-[var(--ink)]"
            >
              {showWebhookSecret ? (
                <EyeOff className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <Eye className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
          </div>
          <p className="text-[11px] text-[var(--ink-subtle)] mt-1.5">
            Find this in Stripe Dashboard &gt; Developers &gt; Webhooks.
          </p>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || (!secretKey && !webhookSecret)}
          className="w-full py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <Check className="h-4 w-4" strokeWidth={1.5} />
          )}
          Save keys
        </button>
      </div>

      {/* Webhook URL */}
      <div className="card-flat p-5 mt-4">
        <label className="label-section mb-2 block">Webhook endpoint URL</label>
        <p className="text-[11px] text-[var(--ink-subtle)] mb-3">
          Add this URL in Stripe Dashboard &gt; Developers &gt; Webhooks &gt; Add Endpoint.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm text-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 rounded-[4px] overflow-x-auto mono">
            {webhookUrl}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(webhookUrl);
              setToast({ type: "success", message: "Copied webhook URL" });
            }}
            className="p-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition shrink-0"
          >
            <Copy className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        <div className="mt-3">
          <p className="text-[11px] text-[var(--ink-subtle)] mb-1.5">Required webhook events:</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              "checkout.session.completed",
              "customer.subscription.updated",
              "customer.subscription.deleted",
            ].map((evt) => (
              <span
                key={evt}
                className="text-[10px] text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border border-[var(--rule)] px-2 py-0.5 rounded-[4px] mono"
              >
                {evt}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stripe Dashboard Link */}
      <a
        href="https://dashboard.stripe.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-2 text-sm text-[var(--accent)] hover:opacity-80 transition py-3"
      >
        Open Stripe Dashboard <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
      </a>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className="card-flat flex items-center gap-2 px-4 py-3 rounded-[4px] text-sm font-medium"
            style={{
              background:
                toast.type === "success" ? "var(--verified-soft)" : "var(--danger-soft)",
              borderColor:
                toast.type === "success" ? "var(--verified)" : "var(--danger)",
              color: toast.type === "success" ? "var(--verified)" : "var(--danger)",
            }}
          >
            {toast.type === "success" ? (
              <Check className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <X className="h-4 w-4" strokeWidth={1.5} />
            )}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
