// app/settings/knowledge/KnowledgeSetupClient.tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";

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

export default function KnowledgeSetupClient({
  initialEntries,
  workspaceId,
}: KnowledgeSetupClientProps) {
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
        editingEntry
          ? prev.map((item) => (item.id === editingEntry.id ? payload : item))
          : [payload, ...prev]
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
    const ok = await confirmDialog({
      title: "Delete entry?",
      message: "This will permanently remove the knowledge entry.",
      confirmText: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const response = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
      if (!response.ok) return;
      setEntries((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Error deleting knowledge entry:", error);
    }
  }

  const secondaryButtonClass =
    "inline-flex items-center justify-center rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2 text-sm font-medium text-[var(--ink-muted)] transition hover:bg-[var(--canvas-subtle)] hover:text-[var(--ink)]";

  return (
    <div className="space-y-8">
      <div className="card-flat flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm text-[var(--ink-muted)]">
            Configure your knowledge base so Drift answers callers accurately — combine company
            info, hours, pricing, and FAQs into curated snippets.
          </p>
          <p className="text-xs text-[var(--ink-subtle)]">
            Tip: short, declarative sentences yield the most reliable responses from the AI.
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="shrink-0 rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90"
        >
          Add entry
        </Button>
      </div>

      {showForm && (
        <div className="card-flat p-6">
          <div className="flex items-center justify-between">
            <h3 className="heading-display text-2xl text-[var(--ink)]">
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
              <label className="flex flex-col gap-1.5 text-sm text-[var(--ink)]">
                <span className="label-section">Category</span>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, category: e.target.value }))
                  }
                  className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none"
                  required
                >
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-sm text-[var(--ink)]">
                <span className="label-section">Title</span>
                <input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none"
                  placeholder="Service hours, emergency policy, etc."
                  required
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-sm text-[var(--ink)]">
              <span className="label-section">Content</span>
              <textarea
                value={formData.content}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, content: e.target.value }))
                }
                className="min-h-[160px] rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none"
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
              <Button
                type="submit"
                className="rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90"
              >
                {editingEntry ? "Save changes" : "Save entry"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {Object.keys(groupedEntries).length === 0 ? (
        <div className="rounded-[6px] border border-dashed border-[var(--rule-strong)] bg-[var(--canvas-subtle)] p-12 text-center">
          <p className="heading-display text-2xl text-[var(--ink)]">No knowledge entries yet</p>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Add curated snippets so Drift can answer questions about your services, pricing, and
            policies.
          </p>
          <Button
            onClick={() => setShowForm(true)}
            className="mt-6 rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90"
          >
            Add first entry
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedEntries).map(([category, categoryEntries]) => (
            <section key={category} className="card-flat overflow-hidden">
              <header className="flex items-center justify-between border-b border-[var(--rule)] bg-[var(--canvas-subtle)] px-6 py-4">
                <div>
                  <h3 className="heading-display text-xl text-[var(--ink)]">{category}</h3>
                  <p className="text-xs text-[var(--ink-muted)] mono">
                    {categoryEntries.length} {categoryEntries.length === 1 ? "entry" : "entries"}
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full border border-[var(--rule)] bg-[var(--canvas)] px-3 py-1 text-xs text-[var(--ink-muted)]">
                  Organized context
                </div>
              </header>

              <div className="divide-y divide-[var(--rule)]">
                {categoryEntries.map((entry) => (
                  <article key={entry.id} className="px-6 py-5 text-sm text-[var(--ink)]">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="max-w-3xl space-y-3">
                        <h4 className="text-base font-semibold text-[var(--ink)]">
                          {entry.title}
                        </h4>
                        <p className="whitespace-pre-wrap text-[var(--ink-muted)] prose-body">
                          {entry.content}
                        </p>
                        <p className="mono text-xs text-[var(--ink-subtle)]">
                          Updated {new Date(entry.updated_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button className={secondaryButtonClass} onClick={() => handleEdit(entry)}>
                          Edit
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded-[4px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-2 text-sm font-medium text-[var(--danger)] transition hover:bg-[var(--danger)] hover:text-[var(--canvas)]"
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
