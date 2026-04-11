"use client";

import { useState, useEffect } from "react";
import { CreditCard, Loader2, Check, X, Eye, EyeOff, Copy, ExternalLink } from "lucide-react";
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
        // Refresh settings
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

  const stripeConnected = settings?.stripe_secret_key?.is_set && settings?.stripe_webhook_secret?.is_set;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <CreditCard className="h-6 w-6 text-purple-500" />
          <h1 className="text-3xl font-bold text-white">Billing Settings</h1>
        </div>
        <p className="text-white/40 text-sm ml-9">Connect your Stripe account to manage subscriptions</p>
      </div>

      {/* Connection Status */}
      <div className={`rounded-2xl border p-5 mb-6 ${stripeConnected ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${stripeConnected ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`} />
          <span className={`text-sm font-medium ${stripeConnected ? "text-green-400" : "text-yellow-400"}`}>
            {stripeConnected ? "Stripe Connected" : "Stripe Not Connected"}
          </span>
        </div>
        {!stripeConnected && (
          <p className="text-white/40 text-xs mt-2 ml-6">Enter your Stripe API keys below to enable billing.</p>
        )}
      </div>

      {/* API Keys */}
      <div className="rounded-2xl border border-purple-500/20 bg-black p-6 space-y-6">
        {/* Secret Key */}
        <div>
          <label className="block text-xs font-medium text-white/50 uppercase tracking-wide mb-2">
            Stripe Secret Key
          </label>
          {settings?.stripe_secret_key?.is_set && (
            <div className="flex items-center gap-2 mb-2">
              <code className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded">{settings.stripe_secret_key.masked}</code>
              <span className="text-[10px] text-green-400">Active</span>
            </div>
          )}
          <div className="relative">
            <input
              type={showSecretKey ? "text" : "password"}
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={settings?.stripe_secret_key?.is_set ? "Enter new key to replace" : "sk_live_..."}
              className="w-full px-4 py-2.5 pr-10 rounded-xl bg-white/5 border border-purple-500/20 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500/50"
            />
            <button
              type="button"
              onClick={() => setShowSecretKey(!showSecretKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
            >
              {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-white/30 mt-1.5">Find this in Stripe Dashboard &gt; Developers &gt; API Keys</p>
        </div>

        {/* Webhook Secret */}
        <div>
          <label className="block text-xs font-medium text-white/50 uppercase tracking-wide mb-2">
            Webhook Signing Secret
          </label>
          {settings?.stripe_webhook_secret?.is_set && (
            <div className="flex items-center gap-2 mb-2">
              <code className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded">{settings.stripe_webhook_secret.masked}</code>
              <span className="text-[10px] text-green-400">Active</span>
            </div>
          )}
          <div className="relative">
            <input
              type={showWebhookSecret ? "text" : "password"}
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={settings?.stripe_webhook_secret?.is_set ? "Enter new secret to replace" : "whsec_..."}
              className="w-full px-4 py-2.5 pr-10 rounded-xl bg-white/5 border border-purple-500/20 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500/50"
            />
            <button
              type="button"
              onClick={() => setShowWebhookSecret(!showWebhookSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
            >
              {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-white/30 mt-1.5">Find this in Stripe Dashboard &gt; Developers &gt; Webhooks</p>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || (!secretKey && !webhookSecret)}
          className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save Keys
        </button>
      </div>

      {/* Webhook URL */}
      <div className="rounded-2xl border border-purple-500/20 bg-black p-6 mt-4">
        <label className="block text-xs font-medium text-white/50 uppercase tracking-wide mb-2">
          Webhook Endpoint URL
        </label>
        <p className="text-[11px] text-white/30 mb-3">Add this URL in Stripe Dashboard &gt; Developers &gt; Webhooks &gt; Add Endpoint</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm text-purple-400 bg-white/5 px-3 py-2 rounded-lg overflow-x-auto">{webhookUrl}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(webhookUrl); setToast({ type: "success", message: "Copied webhook URL" }); }}
            className="p-2 rounded-lg text-white/40 hover:text-purple-400 hover:bg-purple-500/10 transition shrink-0"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3">
          <p className="text-[11px] text-white/30 mb-1">Required webhook events:</p>
          <div className="flex flex-wrap gap-1.5">
            {["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"].map((evt) => (
              <span key={evt} className="text-[10px] text-white/50 bg-white/5 px-2 py-0.5 rounded">{evt}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Stripe Dashboard Link */}
      <a
        href="https://dashboard.stripe.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition py-3"
      >
        Open Stripe Dashboard <ExternalLink className="h-3.5 w-3.5" />
      </a>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${
            toast.type === "success" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}>
            {toast.type === "success" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
