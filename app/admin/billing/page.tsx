"use client";

import { useState, useEffect } from "react";
import {
  CreditCard,
  Check,
  X,
  Loader2,
  Plus,
  Key,
  Shield,
  ExternalLink,
  DollarSign,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  active: boolean;
  priceId: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  priceInterval: string | null;
}

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [hasKey, setHasKey] = useState(false);
  const [hasWebhook, setHasWebhook] = useState(false);
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [savingKeys, setSavingKeys] = useState(false);

  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [productName, setProductName] = useState("");
  const [productAmount, setProductAmount] = useState("");
  const [productInterval, setProductInterval] = useState("month");
  const [creatingProduct, setCreatingProduct] = useState(false);

  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/billing", { credentials: "include" })
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        setHasKey(data.hasKey || false);
        setHasWebhook(data.hasWebhook || false);
        setMaskedKey(data.maskedKey || null);
        setProducts(data.products || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSaveKeys = async () => {
    if (!secretKey && !webhookSecret) return;
    setSavingKeys(true);
    try {
      const res = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...(secretKey ? { stripe_secret_key: secretKey } : {}),
          ...(webhookSecret ? { stripe_webhook_secret: webhookSecret } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setToast({ type: "success", message: "Stripe keys saved" });
      setHasKey(true);
      if (webhookSecret) setHasWebhook(true);
      setMaskedKey(secretKey ? `${secretKey.slice(0, 7)}...${secretKey.slice(-4)}` : maskedKey);
      setSecretKey("");
      setWebhookSecret("");
      // Refresh products
      const refresh = await fetch("/api/admin/billing", { credentials: "include" });
      if (refresh.ok) {
        const d = await refresh.json();
        setProducts(d.products || []);
      }
    } catch (err: any) {
      setToast({ type: "error", message: err.message });
    } finally {
      setSavingKeys(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!productName || !productAmount) return;
    setCreatingProduct(true);
    try {
      const res = await fetch("/api/admin/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: productName,
          amount: parseFloat(productAmount),
          interval: productInterval,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");
      setToast({ type: "success", message: `Created "${productName}"` });
      setProducts(prev => [...prev, {
        id: data.product.id,
        name: data.product.name,
        active: true,
        priceId: data.price.id,
        priceAmount: data.price.amount,
        priceCurrency: "usd",
        priceInterval: data.price.interval,
      }]);
      setProductName("");
      setProductAmount("");
      setShowCreateProduct(false);
    } catch (err: any) {
      setToast({ type: "error", message: err.message });
    } finally {
      setCreatingProduct(false);
    }
  };

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
          <h1 className="text-3xl font-bold text-white">Billing</h1>
        </div>
        <p className="text-white/40 text-sm ml-9">Connect Stripe and manage subscription plans</p>
      </div>

      {/* Connection Status */}
      <div className="rounded-2xl border border-purple-500/20 bg-black p-6 mb-4">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Key className="h-4 w-4 text-purple-500" />
          Stripe Connection
        </h2>

        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${hasKey ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-xs text-white/60">API Key {hasKey ? "connected" : "missing"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${hasWebhook ? "bg-green-500" : "bg-yellow-500"}`} />
            <span className="text-xs text-white/60">Webhook {hasWebhook ? "configured" : "not set"}</span>
          </div>
          {maskedKey && (
            <span className="text-[11px] text-white/30 font-mono">{maskedKey}</span>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-white/40 uppercase tracking-wide mb-1">Secret Key</label>
            <input
              type="password"
              value={secretKey}
              onChange={e => setSecretKey(e.target.value)}
              placeholder={hasKey ? "••• key saved — paste new to replace" : "sk_live_... or sk_test_..."}
              className="w-full px-3 py-2 text-sm rounded-xl bg-white/5 border border-purple-500/20 text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50"
            />
          </div>
          <div>
            <label className="block text-[11px] text-white/40 uppercase tracking-wide mb-1">Webhook Secret</label>
            <input
              type="password"
              value={webhookSecret}
              onChange={e => setWebhookSecret(e.target.value)}
              placeholder={hasWebhook ? "••• saved — paste new to replace" : "whsec_..."}
              className="w-full px-3 py-2 text-sm rounded-xl bg-white/5 border border-purple-500/20 text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50"
            />
            <p className="text-[10px] text-white/25 mt-1">
              Webhook URL: <code className="text-purple-500/60">https://driftai.studio/api/stripe/webhook</code>
            </p>
          </div>
          <button
            onClick={handleSaveKeys}
            disabled={savingKeys || (!secretKey && !webhookSecret)}
            className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition disabled:opacity-40 flex items-center gap-2"
          >
            {savingKeys ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
            Save Keys
          </button>
        </div>
      </div>

      {/* Products */}
      <div className="rounded-2xl border border-purple-500/20 bg-black p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-purple-500" />
            Subscription Plans
          </h2>
          {hasKey && (
            <button
              onClick={() => setShowCreateProduct(!showCreateProduct)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-purple-400 hover:bg-purple-500/10 border border-purple-500/20 transition"
            >
              <Plus className="h-3 w-3" />
              New Plan
            </button>
          )}
        </div>

        {!hasKey ? (
          <div className="py-8 text-center">
            <CreditCard className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-white/40 text-sm">Add your Stripe API key above to manage plans</p>
          </div>
        ) : (
          <>
            {showCreateProduct && (
              <div className="mb-4 p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-3">
                <input
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  placeholder="Plan name (e.g. Drift Pro)"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-black border border-purple-500/20 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      value={productAmount}
                      onChange={e => setProductAmount(e.target.value)}
                      placeholder="Price (USD)"
                      className="w-full px-3 py-2 text-sm rounded-lg bg-black border border-purple-500/20 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <select
                    value={productInterval}
                    onChange={e => setProductInterval(e.target.value)}
                    className="px-3 py-2 text-sm rounded-lg bg-black border border-purple-500/20 text-white focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateProduct}
                    disabled={creatingProduct || !productName || !productAmount}
                    className="px-4 py-2 rounded-lg bg-purple-500 text-white text-xs font-medium hover:bg-purple-600 transition disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {creatingProduct ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Create Plan
                  </button>
                  <button
                    onClick={() => setShowCreateProduct(false)}
                    className="px-3 py-2 rounded-lg text-white/40 hover:text-white/70 text-xs transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {products.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-white/30 text-sm">No plans yet. Create one to start billing customers.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {products.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-purple-500/10 hover:border-purple-500/20 transition">
                    <div>
                      <div className="text-sm font-medium text-white">{p.name}</div>
                      <div className="text-[11px] text-white/30 font-mono">{p.priceId}</div>
                    </div>
                    <div className="text-right">
                      {p.priceAmount !== null && (
                        <div className="text-sm font-semibold text-purple-400">
                          ${(p.priceAmount / 100).toFixed(2)}
                          <span className="text-white/30 font-normal text-xs">/{p.priceInterval}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-4 text-[11px] text-purple-500 hover:text-purple-400 transition"
            >
              Open Stripe Dashboard <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${
            toast.type === "success"
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}>
            {toast.type === "success" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
