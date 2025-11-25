"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

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
        headers: {
          "Content-Type": "application/json",
        },
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
        setFormData({
          product: "",
          price: "",
          month: new Date().getMonth() + 1,
          day: new Date().getDate(),
          year: new Date().getFullYear(),
          company_name: "",
        });
      } else {
        const error = await response.json();
        alert(error.error || "Failed to add expense record");
      }
    } catch (error) {
      console.error("Failed to add record:", error);
      alert("Failed to add expense record");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this expense record?")) {
      return;
    }

    try {
      const response = await fetch(`/api/sales-records?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setRecords(prev => prev.filter(record => record.id !== id));
      } else {
        alert("Failed to delete expense record");
      }
    } catch (error) {
      console.error("Failed to delete record:", error);
      alert("Failed to delete expense record");
    }
  };

  const totalExpenses = records.reduce((sum, record) => sum + record.price, 0);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-1/4 rounded bg-white/10"></div>
          <div className="h-4 w-1/2 rounded bg-white/10"></div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="h-32 rounded-2xl bg-white/10"></div>
            <div className="h-32 rounded-2xl bg-white/10"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-white">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-semibold text-white">Analytics & Reports</h1>
        <p className="text-white/60">Platform-wide analytics and reporting.</p>
      </div>

      {/* Summary Cards */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
          <h3 className="mb-2 text-lg font-semibold text-white">Total Expenses</h3>
          <p className="text-3xl font-bold text-[#7a8dff]">${totalExpenses.toFixed(2)}</p>
          <p className="mt-1 text-sm text-white/60">All time expenses</p>
        </div>
        
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
          <h3 className="mb-2 text-lg font-semibold text-white">Total Records</h3>
          <p className="text-3xl font-bold text-[#7a8dff]">{records.length}</p>
          <p className="mt-1 text-sm text-white/60">Expense entries</p>
        </div>
      </div>

      {/* Add Expense Form */}
      <div className="mb-8 rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
        <h2 className="mb-6 text-xl font-semibold text-white">Add Expense Record</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <label htmlFor="product" className="mb-2 block text-sm font-semibold text-white/70">
              Expense Category *
            </label>
            <input
              type="text"
              id="product"
              required
              value={formData.product}
              onChange={(e) => setFormData(prev => ({ ...prev, product: e.target.value }))}
              className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-white shadow-sm transition focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/40"
              placeholder="e.g., Office Supplies"
            />
          </div>
          
          <div>
            <label htmlFor="price" className="mb-2 block text-sm font-semibold text-white/70">
              Amount *
            </label>
            <input
              type="number"
              id="price"
              step="0.01"
              min="0"
              required
              value={formData.price}
              onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
              className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-white shadow-sm transition focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/40"
              placeholder="0.00"
            />
          </div>
          
          <div>
            <label htmlFor="company_name" className="mb-2 block text-sm font-semibold text-white/70">
              Company *
            </label>
            <input
              type="text"
              id="company_name"
              required
              value={formData.company_name}
              onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
              className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-white shadow-sm transition focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/40"
              placeholder="Company Name"
            />
          </div>
          
          <div>
            <label htmlFor="month" className="mb-2 block text-sm font-semibold text-white/70">
              Month *
            </label>
            <select
              id="month"
              required
              value={formData.month}
              onChange={(e) => setFormData(prev => ({ ...prev, month: parseInt(e.target.value) }))}
              className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-white shadow-sm transition focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/40"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(0, i).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="day" className="mb-2 block text-sm font-semibold text-white/70">
              Day *
            </label>
            <input
              type="number"
              id="day"
              min="1"
              max="31"
              required
              value={formData.day}
              onChange={(e) => setFormData(prev => ({ ...prev, day: parseInt(e.target.value) }))}
              className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-white shadow-sm transition focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/40"
            />
          </div>
          
          <div>
            <label htmlFor="year" className="mb-2 block text-sm font-semibold text-white/70">
              Year *
            </label>
            <input
              type="number"
              id="year"
              min="2020"
              max="2030"
              required
              value={formData.year}
              onChange={(e) => setFormData(prev => ({ ...prev, year: parseInt(e.target.value) }))}
              className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-white shadow-sm transition focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/40"
            />
          </div>
          
          <div className="md:col-span-3">
            <Button
              type="submit"
              disabled={isAdding}
              className="rounded-xl bg-[#3351ff] px-6 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:bg-[#4a64ff] hover:shadow-xl"
            >
              {isAdding ? "Adding..." : "Add Expense"}
            </Button>
          </div>
        </form>
      </div>

      {/* Expense Records Table */}
      <div className="rounded-2xl border border-white/10 bg-black/40 shadow-lg">
        <div className="border-b border-white/10 px-6 py-6">
          <h2 className="text-xl font-semibold text-white">Expense Records</h2>
        </div>
        
        {records.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-white/60">No expense records yet</p>
            <p className="mt-2 text-sm text-white/50">Add your first expense record to get started with analytics.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-white/80">
              <thead className="border-b border-white/10 text-white/60">
                <tr className="text-left">
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Category</th>
                  <th className="px-6 py-4 font-medium">Amount</th>
                  <th className="px-6 py-4 font-medium">Company</th>
                  <th className="px-6 py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {records.map((record) => (
                  <tr key={record.id} className="transition-colors hover:bg-white/5">
                    <td className="px-6 py-4 text-white">{record.month}/{record.day}/{record.year}</td>
                    <td className="px-6 py-4 text-white/80">{record.product}</td>
                    <td className="px-6 py-4 font-medium text-[#7a8dff]">${record.price.toFixed(2)}</td>
                    <td className="px-6 py-4 text-white/80">{record.company_name}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="font-medium text-red-300 hover:text-red-200"
                      >
                        Delete
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
