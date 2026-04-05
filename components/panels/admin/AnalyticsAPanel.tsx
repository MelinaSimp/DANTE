"use client";

import { useState, useEffect } from "react";
import { DollarSign, Plus, Trash2, Loader2 } from "lucide-react";

interface Record { id: string; description: string; amount: number; category: string; date: string }

export default function AnalyticsAPanel() {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("other");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch("/api/sales-records").then(r => r.ok ? r.json() : []).then(d => setRecords(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!desc.trim() || !amount) return; setAdding(true);
    try {
      const r = await fetch("/api/sales-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: desc.trim(), amount: parseFloat(amount), category }) });
      if (r.ok) { const d = await r.json(); setRecords(p => [d, ...p]); setDesc(""); setAmount(""); }
    } catch {} finally { setAdding(false); }
  };

  const handleDelete = async (id: string) => {
    try { const r = await fetch(`/api/sales-records?id=${id}`, { method: "DELETE" }); if (r.ok) setRecords(p => p.filter(x => x.id !== id)); } catch {}
  };

  const total = records.reduce((s, r) => s + (r.amount || 0), 0);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl border border-purple-500/20 bg-black/40 p-4">
          <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Total Expenses</div>
          <div className="text-2xl font-bold text-purple-400">${total.toFixed(2)}</div>
        </div>
        <div className="rounded-2xl border border-purple-500/20 bg-black/40 p-4">
          <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Records</div>
          <div className="text-2xl font-bold text-purple-400">{records.length}</div>
        </div>
      </div>

      {/* Add form */}
      <div className="rounded-2xl border border-purple-500/20 bg-black/40 p-4 mb-6">
        <div className="flex gap-2">
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description"
            className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-purple-500/20 text-white text-sm placeholder:text-white/30 focus:outline-none" />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount"
            className="w-24 px-3 py-2 rounded-xl bg-white/5 border border-purple-500/20 text-white text-sm placeholder:text-white/30 focus:outline-none" />
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/5 border border-purple-500/20 text-white text-sm focus:outline-none">
            <option value="software">Software</option><option value="marketing">Marketing</option><option value="hosting">Hosting</option><option value="other">Other</option>
          </select>
          <button onClick={handleAdd} disabled={adding || !desc.trim() || !amount}
            className="px-3 py-2 rounded-xl bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 disabled:opacity-40">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* List */}
      {records.length === 0 ? (
        <div className="text-center py-12 text-white/30 text-sm">No records</div>
      ) : (
        <div className="space-y-1.5">
          {records.map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-purple-500/10 bg-black/30 px-4 py-3 group">
              <div className="flex items-center gap-3">
                <DollarSign className="h-4 w-4 text-purple-500/60" />
                <div>
                  <div className="text-sm text-white">{r.description}</div>
                  <div className="text-[11px] text-white/30">{r.category} · {new Date(r.date).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-purple-400">${r.amount?.toFixed(2)}</span>
                <button onClick={() => handleDelete(r.id)} className="p-1 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
