// app/settings/knowledge/KnowledgeSetupClient.tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface KnowledgeSetupClientProps {
  initialEntries: KnowledgeEntry[];
  workspaceId: string;
}

const categories = [
  "Company Info",
  "Services",
  "Pricing",
  "Hours & Coverage",
  "FAQs",
  "Scheduling Rules",
  "Emergency Procedures",
  "Other",
];

export default function KnowledgeSetupClient({ initialEntries, workspaceId }: KnowledgeSetupClientProps) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [formData, setFormData] = useState({
    category: "",
    title: "",
    content: "",
  });

  const groupedEntries = useMemo(() => {
    return entries.reduce((acc, entry) => {
      if (!acc[entry.category]) acc[entry.category] = [];
      acc[entry.category].push(entry);
      return acc;
    }, {} as Record<string, KnowledgeEntry[]>);
  }, [entries]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const response = await fetch("/api/knowledge", {
        method: editingEntry ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEntry?.id,
          workspace_id: workspaceId,
          category: formData.category,
          title: formData.title,
          content: formData.content,
        }),
      });

      if (!response.ok) return;
      const payload = await response.json();

      setEntries((prev) =>
        editingEntry ? prev.map((item) => (item.id === editingEntry.id ? payload : item)) : [payload, ...prev]
      );

      setFormData({ category: "", title: "", content: "" });
      setEditingEntry(null);
      setShowForm(false);
    } catch (error) {
      console.error("Error saving knowledge entry:", error);
    }
  }

  function handleEdit(entry: KnowledgeEntry) {
    setEditingEntry(entry);
    setFormData({
      category: entry.category,
      title: entry.title,
      content: entry.content,
    });
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this entry?")) return;

    try {
      const response = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
      if (!response.ok) return;
      setEntries((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Error deleting knowledge entry:", error);
    }
  }

  const secondaryButtonClass =
    "inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-black/40 p-6 shadow-[0_25px_80px_rgba(8,8,16,0.55)] sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm text-white/70">
            Configure your knowledge base so Drift answers callers accurately—combine company info,
            hours, pricing, and FAQs into curated snippets.
          </p>
          <p className="text-xs text-white/50">
            Tip: Short, declarative sentences yield the most reliable responses from the AI.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="shrink-0">
          Add Entry
        </Button>
      </div>

      {showForm && (
        <div className="rounded-3xl border border-white/10 bg-black/50 p-6 shadow-[0_20px_70px_rgba(8,8,16,0.45)]">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-white">
              {editingEntry ? "Edit knowledge entry" : "Add new knowledge entry"}
            </h3>
            <button
              className={secondaryButtonClass}
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingEntry(null);
                setFormData({ category: "", title: "", content: "" });
              }}
            >
              Close
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-white/70">
                Category
                <select
                  value={formData.category}
                  onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                  className="rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  required
                >
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category} value={category} className="bg-slate-900 text-white">
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm text-white/70">
                Title
                <input
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  className="rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="Service hours, emergency policy, etc."
                  required
                />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm text-white/70">
              Content
              <textarea
                value={formData.content}
                onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                className="min-h-[160px] rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="Detailed information that the AI should know..."
                required
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => {
                  setShowForm(false);
                  setEditingEntry(null);
                  setFormData({ category: "", title: "", content: "" });
                }}
              >
                Cancel
              </button>
              <Button type="submit">
                {editingEntry ? "Save changes" : "Save entry"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {Object.keys(groupedEntries).length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/15 bg-black/20 p-12 text-center">
          <p className="text-lg font-medium text-white/70">No knowledge entries yet</p>
          <p className="mt-2 text-sm text-white/50">
            Add curated snippets so Drift can answer questions about your services, pricing, and policies.
          </p>
          <Button onClick={() => setShowForm(true)} className="mt-6">
            Add first entry
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedEntries).map(([category, categoryEntries]) => (
            <section
              key={category}
              className="overflow-hidden rounded-3xl border border-white/10 bg-black/35 shadow-[0_25px_80px_rgba(8,8,16,0.55)]"
            >
              <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                <div>
                  <h3 className="text-xl font-semibold text-white">{category}</h3>
                  <p className="text-xs text-white/50">{categoryEntries.length} entries</p>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                  Organized context
                </div>
              </header>

              <div className="divide-y divide-white/10">
                {categoryEntries.map((entry) => (
                  <article key={entry.id} className="px-6 py-5 text-sm text-white/80">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="max-w-3xl space-y-3">
                        <h4 className="text-base font-semibold text-white">{entry.title}</h4>
                        <p className="whitespace-pre-wrap text-white/70">{entry.content}</p>
                        <p className="text-xs text-white/40">
                          Updated {new Date(entry.updated_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button className={secondaryButtonClass} onClick={() => handleEdit(entry)}>
                          Edit
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20"
                          onClick={() => handleDelete(entry.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
