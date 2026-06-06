"use client";

// LibraryClient — workspace-shared saved prompts. Same Harvey-flavored
// shell as Vault: editorial hero, list of cards, edit modal. The
// prompt body keeps {placeholder} tokens as-is — the user fills them
// in at send time when they pick the prompt from the Vergil/Dante
// input picker.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Plus,
  Loader2,
  Search,
  X,
  Trash2,
  AlertCircle,
  Save,
  CheckCircle2,
  Copy,
} from "lucide-react";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger";
import { usePageContext } from "@/components/dante/PageContext";

interface Prompt {
  id: string;
  title: string;
  prompt: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export default function LibraryClient() {
  const [items, setItems] = useState<Prompt[] | null>(null);

  usePageContext({
    title: "Library",
    subtitle: "Saved prompts",
  });

  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Prompt | "new" | null>(null);
  const [draft, setDraft] = useState({ title: "", prompt: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = () => {
    setItems(null);
    setError(null);
    fetch("/api/library", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Failed");
        return r.json();
      })
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.prompt.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const openNew = () => {
    setDraft({ title: "", prompt: "", description: "" });
    setEditing("new");
  };
  const openEdit = (p: Prompt) => {
    setDraft({
      title: p.title,
      prompt: p.prompt,
      description: p.description || "",
    });
    setEditing(p);
  };

  const save = async () => {
    if (!draft.title.trim() || !draft.prompt.trim()) {
      setError("Title and prompt are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isNew = editing === "new";
      const url = isNew
        ? "/api/library"
        : `/api/library/${(editing as Prompt).id}`;
      const r = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Save failed");
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Prompt) => {
    if (!confirm(`Delete "${p.title}"?`)) return;
    const r = await fetch(`/api/library/${p.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) load();
  };

  const copy = (p: Prompt) => {
    navigator.clipboard.writeText(p.prompt).catch(() => {});
    setCopiedId(p.id);
    setTimeout(() => setCopiedId(null), 1400);
  };

  const inputClass =
    "w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]";

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/home" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">Library</span>
          </div>
          <Link
            href="/home"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 md:py-10">
        <div className="mb-6 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="label-section mb-1.5">Saved prompts</div>
            <h1 className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1]">
              Library
            </h1>
            <p className="text-sm text-[var(--ink-muted)] mt-1.5 max-w-xl">
              Reusable prompts the workspace can drop into the assistant.
              Use <span className="mono">{`{client}`}</span>,{" "}
              <span className="mono">{`{property}`}</span>, or any other
              placeholder — fill it in when you send.
            </p>
          </div>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            New prompt
          </button>
        </div>

        <div className="mb-6 max-w-md relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]"
            strokeWidth={1.5}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, prompt, or description"
            className={`${inputClass} pl-9`}
          />
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        )}

        {filtered === null ? (
          <div className="flex items-center justify-center py-32">
            <Loader2
              className="w-6 h-6 animate-spin text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <BookOpen
              className="w-10 h-10 text-[var(--ink-subtle)] mx-auto mb-3"
              strokeWidth={1}
            />
            <h2 className="heading-display text-xl text-[var(--ink)] mb-1.5">
              {items && items.length > 0
                ? "Nothing matches"
                : "No saved prompts yet"}
            </h2>
            <p className="text-sm text-[var(--ink-muted)] max-w-md mx-auto mb-4">
              {items && items.length > 0
                ? "Clear the search or save a new prompt."
                : "Save your most-used questions so the team can reach for them on every call."}
            </p>
            {(!items || items.length === 0) && (
              <button
                onClick={openNew}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                New prompt
              </button>
            )}
          </div>
        ) : (
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((p) => (
              <StaggerItem
                key={p.id}
                className="rounded-[8px] border border-[var(--rule)] hover:border-[var(--rule-strong)] bg-[var(--canvas)] p-4 flex flex-col gap-2 transition"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <button
                    onClick={() => openEdit(p)}
                    className="text-sm font-semibold text-[var(--ink)] text-left hover:underline underline-offset-2"
                  >
                    {p.title}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => copy(p)}
                      title="Copy prompt"
                      className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                    >
                      {copiedId === p.id ? (
                        <CheckCircle2
                          className="w-3.5 h-3.5 text-[var(--verified)]"
                          strokeWidth={1.5}
                        />
                      ) : (
                        <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                      )}
                    </button>
                    <button
                      onClick={() => remove(p)}
                      title="Delete"
                      className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
                {p.description && (
                  <div className="text-[11px] text-[var(--ink-subtle)] italic">
                    {p.description}
                  </div>
                )}
                <pre className="whitespace-pre-wrap text-[12px] text-[var(--ink-muted)] leading-relaxed font-sans line-clamp-4">
                  {p.prompt}
                </pre>
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/30 backdrop-blur-sm px-4 py-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[8px] shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
              <div>
                <div className="label-section mb-0.5">
                  {editing === "new" ? "New prompt" : "Edit prompt"}
                </div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">
                  Saved prompt
                </h3>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <label className="block">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  Title
                </div>
                <input
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  placeholder="e.g. Quarterly review draft"
                  className={inputClass}
                  autoFocus
                />
              </label>
              <label className="block">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  Description (optional)
                </div>
                <input
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  placeholder="One-line note about when to use this"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  Prompt
                </div>
                <textarea
                  value={draft.prompt}
                  onChange={(e) =>
                    setDraft({ ...draft, prompt: e.target.value })
                  }
                  rows={10}
                  placeholder="Draft a quarterly review email for {client} highlighting their YTD return and the next planned check-in date."
                  className={`${inputClass} resize-y leading-relaxed`}
                />
                <p className="text-[11px] text-[var(--ink-subtle)] mt-1.5">
                  Use curly braces for placeholders —{" "}
                  <span className="mono">{`{client}`}</span>,{" "}
                  <span className="mono">{`{property}`}</span>,{" "}
                  <span className="mono">{`{closing_date}`}</span>. Fill
                  them in when you send.
                </p>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-[var(--rule)] flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Save className="w-4 h-4" strokeWidth={1.5} />
                )}
                {saving ? "Saving…" : "Save prompt"}
              </button>
              <span className="text-[11px] text-[var(--ink-subtle)]">
                Esc to close.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
