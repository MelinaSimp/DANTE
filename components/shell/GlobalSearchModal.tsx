"use client";

// GlobalSearchModal — ⌘K palette. Searches across vault, projects,
// contacts, properties, prompts, review tables, reminders. Debounced
// so we don't fire on every keystroke. Arrow keys navigate, enter
// opens the highlighted result, esc closes.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  Home,
  FolderClosed,
  FileText,
  Table2,
  BookOpen,
  Bell,
  Loader2,
  CornerDownLeft,
  X,
} from "lucide-react";

type Kind =
  | "vault_item"
  | "vault_project"
  | "property"
  | "contact"
  | "library_prompt"
  | "review_table"
  | "reminder";

interface SearchResult {
  id: string;
  kind: Kind;
  title: string;
  subtitle?: string;
  href: string;
}

const KIND_ICON: Record<Kind, React.ComponentType<any>> = {
  vault_item: FileText,
  vault_project: FolderClosed,
  property: Home,
  contact: Users,
  library_prompt: BookOpen,
  review_table: Table2,
  reminder: Bell,
};

const KIND_LABEL: Record<Kind, string> = {
  vault_item: "Vault item",
  vault_project: "Vault project",
  property: "Property",
  contact: "Contact",
  library_prompt: "Prompt",
  review_table: "Review table",
  reminder: "Reminder",
};

export default function GlobalSearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<"recent" | "search">("recent");

  // Reset every time we open. Refocus the input.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults([]);
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Debounced fetch — 200ms after the user stops typing. When q is
  // empty (or below 2 chars) the API returns recent items so the
  // modal feels useful immediately on open.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const controller = new AbortController();
    const t = setTimeout(
      async () => {
        try {
          const r = await fetch(
            `/api/search?q=${encodeURIComponent(q.trim())}`,
            { credentials: "include", signal: controller.signal }
          );
          if (!r.ok) throw new Error("fail");
          const j = await r.json();
          setResults(Array.isArray(j.results) ? j.results : []);
          setMode(j.mode === "search" ? "search" : "recent");
          setActiveIndex(0);
        } catch {
          if (!controller.signal.aborted) setResults([]);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      q.trim().length < 2 ? 0 : 200
    );
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [q, open]);

  // Group results by kind so the list reads at a glance. Within a
  // kind, preserve API order.
  const grouped = useMemo(() => {
    const map = new Map<Kind, SearchResult[]>();
    for (const r of results) {
      const arr = map.get(r.kind) || [];
      arr.push(r);
      map.set(r.kind, arr);
    }
    // Preserve a deterministic kind ordering so the user always finds
    // the same group in the same place.
    const order: Kind[] = [
      "contact",
      "property",
      "vault_project",
      "vault_item",
      "review_table",
      "library_prompt",
      "reminder",
    ];
    return order
      .filter((k) => map.has(k))
      .map((k) => ({ kind: k, items: map.get(k)! }));
  }, [results]);

  // Flat list of results in display order — used by arrow-key nav.
  const flat = useMemo(
    () => grouped.flatMap((g) => g.items),
    [grouped]
  );

  const open_ = (item: SearchResult) => {
    onClose();
    router.push(item.href);
  };

  // Keyboard navigation: ↑ ↓ to move, Enter to open, Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flat[activeIndex];
        if (item) open_(item);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, activeIndex, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[var(--ink)]/30 backdrop-blur-sm pt-24 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[8px] shadow-2xl w-full max-w-xl flex flex-col overflow-hidden">
        {/* Input row */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule)]">
          {loading ? (
            <Loader2
              className="w-4 h-4 text-[var(--ink-muted)] animate-spin"
              strokeWidth={1.5}
            />
          ) : (
            <Search
              className="w-4 h-4 text-[var(--ink-muted)]"
              strokeWidth={1.5}
            />
          )}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search across vault, contacts, properties, prompts…"
            className="flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
            title="Close"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Results body */}
        <div className="max-h-[400px] overflow-y-auto">
          {mode === "recent" && flat.length > 0 && (
            <div className="px-4 pt-3 pb-1 text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] flex items-center gap-2">
              <span>Recent</span>
              <span className="text-[var(--ink-subtle)]">·</span>
              <span className="text-[var(--ink-subtle)] normal-case tracking-normal">
                Type to search
              </span>
            </div>
          )}
          {flat.length === 0 && !loading ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">
              {q.trim().length < 2
                ? "Nothing in this workspace yet."
                : `No matches for "${q}".`}
            </div>
          ) : (
            grouped.map((g) => {
              const Icon = KIND_ICON[g.kind];
              return (
                <div key={g.kind} className="border-b border-[var(--rule)] last:border-b-0">
                  <div className="px-4 pt-3 pb-1.5 text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                    {KIND_LABEL[g.kind]}
                  </div>
                  <ul>
                    {g.items.map((item) => {
                      const flatIdx = flat.findIndex((x) => x === item);
                      const active = flatIdx === activeIndex;
                      return (
                        <li key={`${item.kind}:${item.id}`}>
                          <button
                            onClick={() => open_(item)}
                            onMouseEnter={() => setActiveIndex(flatIdx)}
                            className="w-full flex items-center gap-3 px-4 py-2 text-left transition"
                            style={{
                              background: active
                                ? "var(--canvas-subtle)"
                                : "transparent",
                            }}
                          >
                            <Icon
                              className="w-4 h-4 text-[var(--ink-muted)] shrink-0"
                              strokeWidth={1.5}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-[var(--ink)] truncate">
                                {item.title}
                              </div>
                              {item.subtitle && (
                                <div className="text-[11px] text-[var(--ink-subtle)] truncate">
                                  {item.subtitle}
                                </div>
                              )}
                            </div>
                            {active && (
                              <CornerDownLeft
                                className="w-3 h-3 text-[var(--ink-subtle)] shrink-0"
                                strokeWidth={1.5}
                              />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-[var(--rule)] flex items-center justify-between text-[10px] text-[var(--ink-subtle)] mono">
          <div className="flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
          <span>{flat.length} result{flat.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}
