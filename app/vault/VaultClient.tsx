"use client";

// VaultClient — Harvey-style Vault landing. Grid of project cards
// (each holds many vault_items), plus a "Loose files" virtual card
// for anything not yet placed in a project. Click a project to land
// on its detail page where the assistant can ask + the file list
// lives. New project is a small modal — name + optional description,
// then it's immediately available to upload into.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FolderClosed,
  Folder,
  FolderPlus,
  Search,
  Loader2,
  AlertCircle,
  X,
  Save,
  Sparkles,
  ScrollText,
} from "lucide-react";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger";

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  counts: { templates: number; documents: number };
}

interface ProjectsPayload {
  projects: Project[];
  loose_count: number;
}

export default function VaultClient() {
  const router = useRouter();
  const [data, setData] = useState<ProjectsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "" });

  const load = () => {
    setData(null);
    setError(null);
    fetch("/api/vault/projects", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Failed");
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (!search.trim()) return data.projects;
    const q = search.toLowerCase();
    return data.projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  const submitCreate = async () => {
    if (!draft.name.trim()) return setError("Name required");
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/vault/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Create failed");
      const created = await r.json();
      setCreateOpen(false);
      setDraft({ name: "", description: "" });
      router.push(`/vault/projects/${created.id}`);
    } catch (e: any) {
      setError(e.message || "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const inputClass =
    "w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]";

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/dashboard" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">Vault</span>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 md:py-10">
        <div className="mb-6 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="label-section mb-1.5">Workspace archive</div>
            <h1 className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1]">
              Vault
            </h1>
            <p className="text-sm text-[var(--ink-muted)] mt-1.5 max-w-xl">
              Group templates and documents into projects. Each project
              gets its own ask box and file list — Vergil cites only from
              that project's contents when you're inside it.
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
          >
            <FolderPlus className="w-4 h-4" strokeWidth={1.5} />
            New project
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
            placeholder="Search projects"
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
        ) : filtered.length === 0 && (data?.loose_count ?? 0) === 0 ? (
          <div className="py-12 text-center">
            <Folder
              className="w-10 h-10 text-[var(--ink-subtle)] mx-auto mb-3"
              strokeWidth={1}
            />
            <h2 className="heading-display text-xl text-[var(--ink)] mb-1.5">
              No projects yet
            </h2>
            <p className="text-sm text-[var(--ink-muted)] max-w-md mx-auto mb-4">
              Create your first project — e.g. "Smith family", "1234 Main
              St", or "Standard listing templates".
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
            >
              <FolderPlus className="w-4 h-4" strokeWidth={1.5} />
              New project
            </button>
          </div>
        ) : (
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((p) => (
              <StaggerItem key={p.id}>
              <button
                onClick={() => router.push(`/vault/projects/${p.id}`)}
                className="group text-left transition flex flex-col hover:border-[var(--rule-strong)] w-full h-full"
                style={{
                  background: "var(--canvas)",
                  border: "1px solid var(--rule)",
                  borderRadius: "8px",
                  minHeight: "180px",
                }}
              >
                <div
                  className="flex items-center justify-center"
                  style={{
                    background: "var(--canvas-subtle)",
                    borderRadius: "8px 8px 0 0",
                    height: "84px",
                  }}
                >
                  <FolderClosed
                    className="w-10 h-10 text-[var(--ink-muted)]"
                    strokeWidth={1.25}
                  />
                </div>
                <div className="flex-1 px-4 py-3 flex flex-col">
                  <div className="text-sm font-semibold text-[var(--ink)] truncate mb-1">
                    {p.name}
                  </div>
                  {p.description ? (
                    <p className="text-[12px] text-[var(--ink-muted)] line-clamp-2 mb-2">
                      {p.description}
                    </p>
                  ) : (
                    <p className="text-[12px] text-[var(--ink-subtle)] italic mb-2">
                      No description
                    </p>
                  )}
                  <div className="mt-auto flex items-center gap-2 text-[10px] mono text-[var(--ink-subtle)]">
                    <span className="inline-flex items-center gap-1">
                      <ScrollText className="w-3 h-3" strokeWidth={1.5} />
                      {p.counts.documents} doc
                      {p.counts.documents === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3" strokeWidth={1.5} />
                      {p.counts.templates} template
                      {p.counts.templates === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </button>
              </StaggerItem>
            ))}

            {/* Loose-files virtual card — shown only when there are
                items with no project, so users can find + move them. */}
            {(data?.loose_count ?? 0) > 0 && (
              <StaggerItem>
              <button
                onClick={() => router.push("/vault/projects/loose")}
                className="group text-left transition flex flex-col hover:border-[var(--rule-strong)] w-full h-full"
                style={{
                  background: "var(--canvas)",
                  border: "1px dashed var(--rule-strong)",
                  borderRadius: "8px",
                  minHeight: "180px",
                }}
              >
                <div
                  className="flex items-center justify-center"
                  style={{
                    background: "var(--canvas-subtle)",
                    borderRadius: "8px 8px 0 0",
                    height: "84px",
                  }}
                >
                  <Folder
                    className="w-10 h-10 text-[var(--ink-subtle)]"
                    strokeWidth={1.25}
                  />
                </div>
                <div className="flex-1 px-4 py-3">
                  <div className="text-sm font-semibold text-[var(--ink)] mb-1">
                    Loose files
                  </div>
                  <p className="text-[12px] text-[var(--ink-muted)] mb-2">
                    Items not yet in a project. Open to file them away.
                  </p>
                  <div className="text-[10px] mono text-[var(--ink-subtle)]">
                    {data!.loose_count} file{data!.loose_count === 1 ? "" : "s"}
                  </div>
                </div>
              </button>
              </StaggerItem>
            )}
          </StaggerContainer>
        )}
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/30 backdrop-blur-sm px-4 py-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
        >
          <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[8px] shadow-xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
              <div>
                <div className="label-section mb-0.5">New project</div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">
                  Create a vault project
                </h3>
              </div>
              <button
                onClick={() => setCreateOpen(false)}
                className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 px-6 py-5 space-y-4">
              <label className="block">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  Name
                </div>
                <input
                  value={draft.name}
                  onChange={(e) =>
                    setDraft({ ...draft, name: e.target.value })
                  }
                  placeholder="e.g. Smith family · 1234 Main St"
                  className={inputClass}
                  autoFocus
                />
              </label>
              <label className="block">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  Description (optional)
                </div>
                <textarea
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  rows={2}
                  placeholder="What's in this project? Vergil uses this to know when to use it."
                  className={`${inputClass} resize-y`}
                />
              </label>
            </div>
            <div className="px-6 py-4 border-t border-[var(--rule)] flex items-center gap-3">
              <button
                onClick={submitCreate}
                disabled={creating}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Save className="w-4 h-4" strokeWidth={1.5} />
                )}
                {creating ? "Creating…" : "Create project"}
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
