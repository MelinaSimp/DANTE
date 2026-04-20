"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, DollarSign, FileText, BarChart3 } from "lucide-react";

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
        setRecords((prev) => [newRecord, ...prev]);
        setFormData({
          product: "",
          price: "",
          month: new Date().getMonth() + 1,
          day: new Date().getDate(),
          year: new Date().getFullYear(),
          company_name: "",
        });
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
      if (response.ok) setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (error) {
      console.error("Failed to delete:", error);
    }
  };

  const totalExpenses = records.reduce((sum, r) => sum + r.price, 0);

  const inputClass =
    "w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--accent)] transition";
  const labelClass = "label-section mb-1.5 block";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2
          className="h-6 w-6 animate-spin text-[var(--ink-subtle)]"
          strokeWidth={1.5}
        />
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="label-section mb-2">Admin</div>
        <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">
          Analytics &amp; reports
        </h1>
        <p className="text-[var(--ink-muted)] text-sm">
          Platform expenses and reporting.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="card-flat p-5">
          <div className="label-section flex items-center gap-2 mb-3">
            <DollarSign className="h-3.5 w-3.5" strokeWidth={1.5} />
            Total expenses
          </div>
          <div className="text-3xl text-[var(--ink)]">${totalExpenses.toFixed(2)}</div>
          <div className="text-xs text-[var(--ink-subtle)] mt-1">All time</div>
        </div>
        <div className="card-flat p-5">
          <div className="label-section flex items-center gap-2 mb-3">
            <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
            Total records
          </div>
          <div className="text-3xl text-[var(--ink)]">{records.length}</div>
          <div className="text-xs text-[var(--ink-subtle)] mt-1">Expense entries</div>
        </div>
      </div>

      {/* Add Expense */}
      <div className="mb-8">
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[var(--ink)] text-[var(--canvas)] px-4 py-2 rounded-[4px] text-sm font-medium hover:opacity-90 transition"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Add expense
          </button>
        ) : (
          <div className="card-flat p-5">
            <h2 className="text-base font-medium text-[var(--ink)] mb-5">
              Add expense record
            </h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className={labelClass}>Category</label>
                <input
                  type="text"
                  required
                  value={formData.product}
                  onChange={(e) => setFormData((prev) => ({ ...prev, product: e.target.value }))}
                  className={inputClass}
                  placeholder="e.g., Office Supplies"
                />
              </div>
              <div>
                <label className={labelClass}>Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.price}
                  onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                  className={inputClass}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className={labelClass}>Company</label>
                <input
                  type="text"
                  required
                  value={formData.company_name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, company_name: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="Company name"
                />
              </div>
              <div>
                <label className={labelClass}>Month</label>
                <select
                  value={formData.month}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, month: parseInt(e.target.value) }))
                  }
                  className={inputClass}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(0, i).toLocaleString("default", { month: "long" })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Day</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={formData.day}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, day: parseInt(e.target.value) }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Year</label>
                <input
                  type="number"
                  min="2020"
                  max="2030"
                  required
                  value={formData.year}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, year: parseInt(e.target.value) }))
                  }
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-3 flex gap-3">
                <button
                  type="submit"
                  disabled={isAdding}
                  className="bg-[var(--ink)] text-[var(--canvas)] px-4 py-2 rounded-[4px] text-sm font-medium hover:opacity-90 disabled:opacity-40 transition"
                >
                  {isAdding ? "Adding..." : "Add expense"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-[4px] border border-[var(--rule)] text-[var(--ink-muted)] text-sm hover:text-[var(--ink)] hover:border-[var(--rule-strong)] transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Records Table */}
      <div className="card-flat overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--rule)]">
          <h2 className="text-base font-medium text-[var(--ink)]">Expense records</h2>
        </div>
        {records.length === 0 ? (
          <div className="py-16 text-center">
            <BarChart3
              className="h-8 w-8 text-[var(--ink-subtle)] mx-auto mb-3"
              strokeWidth={1.5}
            />
            <p className="text-[var(--ink-muted)] text-sm">No expense records yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--rule)]">
                <tr>
                  <th className="label-section text-left px-4 py-2">Date</th>
                  <th className="label-section text-left px-4 py-2">Category</th>
                  <th className="label-section text-left px-4 py-2">Amount</th>
                  <th className="label-section text-left px-4 py-2">Company</th>
                  <th className="label-section text-left px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-[var(--rule)] hover:bg-[var(--canvas-subtle)] transition-colors"
                  >
                    <td className="py-3 px-4 text-[var(--ink)] mono text-xs">
                      {record.month}/{record.day}/{record.year}
                    </td>
                    <td className="py-3 px-4 text-[var(--ink)]">{record.product}</td>
                    <td className="py-3 px-4 font-medium text-[var(--ink)] mono">
                      ${record.price.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-[var(--ink-muted)]">{record.company_name}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="p-1.5 rounded-[4px] text-[var(--ink-subtle)] hover:text-[var(--danger)] hover:bg-[var(--canvas-subtle)] transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
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
