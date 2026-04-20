"use client";

import { useState, useEffect } from "react";
import { Key, Loader2, Check, ExternalLink, Copy, Lock } from "lucide-react";
import { reportError } from "@/lib/report-error";

export default function BillingAPanel() {
  const [stripeKey, setStripeKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [copied, setCopied] = useState(false);

  const [backendPw, setBackendPw] = useState("");
  const [backendPwSet, setBackendPwSet] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [savedPw, setSavedPw] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings", { credentials: "include" }).then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setConnected(!!d.stripe_connected);
        setMaskedKey(d.stripe_key_masked || "");
        if (d.backend_password?.is_set) setBackendPwSet(true);
      }
    }).catch(reportError("BillingAPanel: load")).finally(() => setLoading(false));
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

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} /></div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Status */}
      <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-3 h-3 rounded-full ${connected ? "bg-[var(--verified)]" : "bg-[var(--danger)]"}`} />
          <span className="text-sm font-medium text-[var(--ink)]">{connected ? "Stripe Connected" : "Not Connected"}</span>
        </div>
        {maskedKey && <p className="text-xs text-[var(--ink-subtle)] ml-6">Key: {maskedKey}</p>}
      </div>

      {/* Keys */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-[var(--ink-muted)] mb-1 block">Stripe Secret Key</label>
          <input type="password" value={stripeKey} onChange={e => setStripeKey(e.target.value)} placeholder="sk_live_..."
            className="w-full px-4 py-2.5 rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] text-sm placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]" />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--ink-muted)] mb-1 block">Webhook Secret</label>
          <input type="password" value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)} placeholder="whsec_..."
            className="w-full px-4 py-2.5 rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] text-sm placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]" />
        </div>
        <button onClick={handleSave} disabled={saving || (!stripeKey.trim() && !webhookSecret.trim())}
          className="px-5 py-2.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90 disabled:opacity-40 transition">
          {saving ? "Saving..." : saved ? "Saved!" : "Save Keys"}
        </button>
      </div>

      {/* Webhook URL */}
      <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-5">
        <p className="text-xs font-medium text-[var(--ink-muted)] mb-2">Webhook URL</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs text-[var(--accent)] bg-[var(--canvas)] rounded-[4px] px-3 py-2 truncate">{webhookUrl}</code>
          <button onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="p-2 rounded-[4px] text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition">
            {copied ? <Check className="h-4 w-4 text-[var(--verified)]" strokeWidth={1.5} /> : <Copy className="h-4 w-4" strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {/* Backend Password */}
      <div className="border-t border-[var(--rule)] pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-[var(--ink)]">Backend Password</h3>
        </div>
        <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${backendPwSet ? "bg-[var(--verified)]" : "bg-yellow-500"}`} />
            <span className="text-xs text-[var(--ink-subtle)]">{backendPwSet ? "Password is set" : "No password configured"}</span>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--ink-muted)] mb-1 block">New Password</label>
            <input
              type="password"
              value={backendPw}
              onChange={e => setBackendPw(e.target.value)}
              placeholder="Enter new backend password"
              className="w-full px-4 py-2.5 rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] text-sm placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]"
            />
          </div>
          <button
            onClick={async () => {
              if (!backendPw.trim() || backendPw.length < 4) return;
              setSavingPw(true);
              try {
                const r = await fetch("/api/admin/settings", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ backend_password: backendPw.trim() }),
                });
                if (r.ok) {
                  setSavedPw(true);
                  setBackendPwSet(true);
                  setBackendPw("");
                  setTimeout(() => setSavedPw(false), 2000);
                }
              } catch {} finally { setSavingPw(false); }
            }}
            disabled={savingPw || backendPw.length < 4}
            className="px-5 py-2.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90 disabled:opacity-40 transition"
          >
            {savingPw ? "Saving..." : savedPw ? "Updated!" : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}
