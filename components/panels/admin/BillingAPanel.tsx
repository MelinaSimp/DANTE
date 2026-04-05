"use client";

import { useState, useEffect } from "react";
import { Key, Loader2, Check, ExternalLink, Copy } from "lucide-react";

export default function BillingAPanel() {
  const [stripeKey, setStripeKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings", { credentials: "include" }).then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setConnected(!!d.stripe_connected); setMaskedKey(d.stripe_key_masked || ""); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: any = {};
      if (stripeKey.trim()) body.stripe_secret_key = stripeKey.trim();
      if (webhookSecret.trim()) body.stripe_webhook_secret = webhookSecret.trim();
      const r = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); const r2 = await fetch("/api/admin/settings", { credentials: "include" }); if (r2.ok) { const d = await r2.json(); setConnected(!!d.stripe_connected); setMaskedKey(d.stripe_key_masked || ""); } setStripeKey(""); setWebhookSecret(""); }
    } catch {} finally { setSaving(false); }
  };

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/stripe/webhook` : "";

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Status */}
      <div className="rounded-2xl border border-purple-500/20 bg-black/40 p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-3 h-3 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-sm font-medium text-white">{connected ? "Stripe Connected" : "Not Connected"}</span>
        </div>
        {maskedKey && <p className="text-xs text-white/30 ml-6">Key: {maskedKey}</p>}
      </div>

      {/* Keys */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-white/50 mb-1 block">Stripe Secret Key</label>
          <input type="password" value={stripeKey} onChange={e => setStripeKey(e.target.value)} placeholder="sk_live_..."
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-purple-500/20 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-purple-500/50" />
        </div>
        <div>
          <label className="text-xs font-medium text-white/50 mb-1 block">Webhook Secret</label>
          <input type="password" value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)} placeholder="whsec_..."
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-purple-500/20 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-purple-500/50" />
        </div>
        <button onClick={handleSave} disabled={saving || (!stripeKey.trim() && !webhookSecret.trim())}
          className="px-5 py-2.5 rounded-xl bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 disabled:opacity-40 transition">
          {saving ? "Saving..." : saved ? "Saved!" : "Save Keys"}
        </button>
      </div>

      {/* Webhook URL */}
      <div className="rounded-2xl border border-purple-500/20 bg-black/40 p-5">
        <p className="text-xs font-medium text-white/50 mb-2">Webhook URL</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs text-purple-400 bg-white/5 rounded-lg px-3 py-2 truncate">{webhookUrl}</code>
          <button onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition">
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
