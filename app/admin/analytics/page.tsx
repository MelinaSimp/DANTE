"use client";

import { useState, useEffect } from "react";
import { BarChart3, Plus, Trash2, Loader2, DollarSign, FileText } from "lucide-react";

interface SalesRecord {
  id: string;
  product: string;
  price: number;
  month: number;
  day: number;
  year: number;
  company_name: string;
  created_at: string;
}

export default function AnalyticsPage() {
  const [records, setRecords] = useState<SalesRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    product: "",
    price: "",
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
    year: new Date().getFullYear(),
    company_name: "",
  });

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      const response = await fetch("/api/sales-records");
      if (response.ok) {
        const data = await response.json();
        setRecords(data);
      }
    } catch (error) {
      console.error("Failed to fetch records:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      const response = await fetch("/api/sales-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: formData.product,
          price: parseFloat(formData.price),
          month: formData.month,
          day: formData.day,
          year: formData.year,
          company_name: formData.company_name,
        }),
      });
      if (response.ok) {
        const newRecord = await response.json();
        setRecords(prev => [newRecord, ...prev]);
        setFormData({ product: "", price: "", month: new Date().getMonth() + 1, day: new Date().getDate(), year: new Date().getFullYear(), company_name: "" });
        setShowForm(false);
      }
    } catch (error) {
      console.error("Failed to add record:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/sales-records?id=${id}`, { method: "DELETE" });
      if (response.ok) setRecords(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      console.error("Failed to delete:", error);
    }
  };

  const totalExpenses = records.reduce((sum, r) => sum + r.price, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500/40" />
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <BarChart3 className="h-6 w-6 text-orange-500" />
          <h1 className="text-3xl font-bold text-white">Analytics & Reports</h1>
        </div>
        <p className="text-white/40 text-sm ml-9">Platform expenses and reporting</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="rounded-2xl border border-orange-500/20 bg-black p-5">
          <div className="flex items-center gap-2 text-white/40 text-xs font-medium uppercase tracking-wider mb-3">
            <DollarSign className="h-3.5 w-3.5 text-orange-500/60" />
            Total Expenses
          </div>
          <div className="text-3xl font-bold text-orange-500">${totalExpenses.toFixed(2)}</div>
          <div className="text-[11px] text-white/30 mt-1">All time</div>
        </div>
        <div className="rounded-2xl border border-orange-500/20 bg-black p-5">
          <div className="flex items-center gap-2 text-white/40 text-xs font-medium uppercase tracking-wider mb-3">
            <FileText className="h-3.5 w-3.5 text-orange-500/60" />
            Total Records
          </div>
          <div className="text-3xl font-bold text-orange-500">{records.length}</div>
          <div className="text-[11px] text-white/30 mt-1">Expense entries</div>
        </div>
      </div>

      {/* Add Expense */}
      <div className="mb-8">
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 text-black text-sm font-semibold hover:bg-orange-400 transition shadow-lg shadow-orange-500/20"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </button>
        ) : (
          <div className="rounded-2xl border border-orange-500/20 bg-black p-6">
            <h2 className="text-lg font-semibold text-white mb-5">Add Expense Record</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/50 uppercase tracking-wider">Category</label>
                <input
                  type="text"
                  required
                  value={formData.product}
                  onChange={(e) => setFormData(prev => ({ ...prev, product: e.target.value }))}
                  className="w-full rounded-xl border border-orange-500/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition"
                  placeholder="e.g., Office Supplies"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/50 uppercase tracking-wider">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.price}
                  onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                  className="w-full rounded-xl border border-orange-500/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/50 uppercase tracking-wider">Company</label>
                <input
                  type="text"
                  required
                  value={formData.company_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                  className="w-full rounded-xl border border-orange-500/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition"
                  placeholder="Company Name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/50 uppercase tracking-wider">Month</label>
                <select
                  value={formData.month}
                  onChange={(e) => setFormData(prev => ({ ...prev, month: parseInt(e.target.value) }))}
                  className="w-full rounded-xl border border-orange-500/20 bg-white/5 px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString("default", { month: "long" })}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/50 uppercase tracking-wider">Day</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={formData.day}
                  onChange={(e) => setFormData(prev => ({ ...prev, day: parseInt(e.target.value) }))}
                  className="w-full rounded-xl border border-orange-500/20 bg-white/5 px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/50 uppercase tracking-wider">Year</label>
                <input
                  type="number"
                  min="2020"
                  max="2030"
                  required
                  value={formData.year}
                  onChange={(e) => setFormData(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                  className="w-full rounded-xl border border-orange-500/20 bg-white/5 px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition"
                />
              </div>
              <div className="md:col-span-3 flex gap-3">
                <button
                  type="submit"
                  disabled={isAdding}
                  className="px-6 py-2.5 rounded-xl bg-orange-500 text-black text-sm font-semibold hover:bg-orange-400 disabled:opacity-50 transition shadow-lg shadow-orange-500/20"
                >
                  {isAdding ? "Adding..." : "Add Expense"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-2.5 rounded-xl border border-orange-500/20 text-white/50 text-sm font-medium hover:text-white/80 hover:border-orange-500/40 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Expense Records Table */}
      <div className="rounded-2xl border border-orange-500/20 bg-black overflow-hidden">
        <div className="px-6 py-5 border-b border-orange-500/10">
          <h2 className="text-lg font-semibold text-white">Expense Records</h2>
        </div>
        {records.length === 0 ? (
          <div className="py-16 text-center">
            <BarChart3 className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No expense records yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-orange-500/10">
                <tr className="text-left text-white/40 text-xs uppercase tracking-wider">
                  <th className="py-4 px-6 font-medium">Date</th>
                  <th className="py-4 px-4 font-medium">Category</th>
                  <th className="py-4 px-4 font-medium">Amount</th>
                  <th className="py-4 px-4 font-medium">Company</th>
                  <th className="py-4 px-4 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-500/5">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-6 text-white/70">{record.month}/{record.day}/{record.year}</td>
                    <td className="py-4 px-4 text-white/70">{record.product}</td>
                    <td className="py-4 px-4 font-medium text-orange-500">${record.price.toFixed(2)}</td>
                    <td className="py-4 px-4 text-white/50">{record.company_name}</td>
                    <td className="py-4 px-4">
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
