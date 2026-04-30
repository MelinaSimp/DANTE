"use client";

// InboxClient — read-side view of synced Gmail/Outlook messages.
// Filter chips by category (with live counts from /api/inbox facets),
// search box, two-pane layout (list left, detail right). Click a row
// to load body + linked contact + linked property; relabel inline.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Inbox,
  Loader2,
  Search,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Tag,
  User,
  Home,
  Mail,
  Flame,
  Pencil,
} from "lucide-react";
import ComposeDrawer from "./ComposeDrawer";
import EntityAsk from "@/components/dante/EntityAsk";

type Urgency = "urgent" | "needs_attention" | "normal" | "low";

interface Row {
  id: string;
  contact_id: string | null;
  property_id: string | null;
  direction: "inbound" | "outbound";
  from_addr: string;
  to_addrs: string[] | null;
  subject: string | null;
  snippet: string | null;
  received_at: string;
  category: string | null;
  category_confidence: number | null;
  urgency_level: Urgency | null;
  urgency_score: number | null;
}

interface Facet {
  key: string;
  count: number;
}

const URGENCY_LABEL: Record<Urgency, string> = {
  urgent: "Urgent",
  needs_attention: "Needs attention",
  normal: "Normal",
  low: "Low",
};
const URGENCY_CHIP: Record<Urgency, string> = {
  urgent:
    "text-[var(--danger)] bg-[var(--danger-soft)] border-[var(--danger)]/30",
  needs_attention:
    "text-[var(--flag)] bg-[var(--flag-soft)] border-[var(--flag)]/30",
  normal:
    "text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border-[var(--rule)]",
  low: "text-[var(--ink-subtle)] bg-[var(--canvas-subtle)] border-[var(--rule)]",
};

interface Detail extends Row {
  cc_addrs: string[] | null;
  body_text: string | null;
  body_html: string | null;
  contact: { id: string; name: string | null; email: string | null } | null;
  property: { id: string; address_line1: string; city: string | null } | null;
}

interface InboxFacets {
  categories: Facet[];
  urgency: Facet[];
}

const CATEGORY_COLORS: Record<string, string> = {
  client:
    "text-[var(--verified)] bg-[var(--verified-soft)] border-[var(--verified)]/30",
  prospect:
    "text-[var(--accent)] bg-[var(--accent-soft)] border-[var(--accent)]/30",
  buyer:
    "text-[var(--accent)] bg-[var(--accent-soft)] border-[var(--accent)]/30",
  seller:
    "text-[var(--verified)] bg-[var(--verified-soft)] border-[var(--verified)]/30",
  tenant:
    "text-[var(--flag)] bg-[var(--flag-soft)] border-[var(--flag)]/30",
  listing:
    "text-[var(--accent)] bg-[var(--accent-soft)] border-[var(--accent)]/30",
  showing:
    "text-[var(--accent)] bg-[var(--accent-soft)] border-[var(--accent)]/30",
  partner:
    "text-[var(--ink)] bg-[var(--canvas-subtle)] border-[var(--rule)]",
  vendor:
    "text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border-[var(--rule)]",
  other:
    "text-[var(--ink-subtle)] bg-[var(--canvas-subtle)] border-[var(--rule)]",
  uncategorized:
    "text-[var(--ink-subtle)] bg-[var(--canvas-subtle)] border-[var(--rule)] border-dashed",
};

function chipClass(key: string) {
  return CATEGORY_COLORS[key] ?? CATEGORY_COLORS.other;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function InboxClient() {
  const [items, setItems] = useState<Row[] | null>(null);
  const [facets, setFacets] = useState<InboxFacets>({
    categories: [],
    urgency: [],
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeUrgency, setActiveUrgency] = useState<Urgency | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [categorizing, setCategorizing] = useState(false);
  const [categorizeMessage, setCategorizeMessage] = useState<string | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [triageMessage, setTriageMessage] = useState<string | null>(null);
  // Compose drawer — Gmail-style slide-in. Opens from the header
  // button or future "Reply" actions on individual messages.
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDefaults, setComposeDefaults] = useState<{
    to?: string;
    subject?: string;
  }>({});

  const load = () => {
    setItems(null);
    setError(null);
    const params = new URLSearchParams();
    if (activeCategory) params.set("category", activeCategory);
    if (activeUrgency) params.set("urgency", activeUrgency);
    if (search.trim()) params.set("q", search.trim());
    fetch(`/api/inbox?${params.toString()}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Failed");
        return r.json();
      })
      .then((d) => {
        setItems(d.items || []);
        setFacets({
          categories: d.facets?.categories || [],
          urgency: d.facets?.urgency || [],
        });
      })
      .catch((e) => setError(e.message));
  };

  useEffect(load, [activeCategory, activeUrgency]);

  const totalCount = useMemo(
    () => facets.categories.reduce((sum, f) => sum + f.count, 0),
    [facets]
  );
  const uncategorizedCount = useMemo(
    () => facets.categories.find((f) => f.key === "uncategorized")?.count ?? 0,
    [facets]
  );
  const triagedCount = useMemo(
    () => facets.urgency.reduce((sum, f) => sum + f.count, 0),
    [facets]
  );
  const untriagedCount = totalCount - triagedCount;

  const openEmail = async (id: string) => {
    setSelected(null);
    const r = await fetch(`/api/inbox/${id}`, { credentials: "include" });
    if (r.ok) setSelected(await r.json());
  };

  const triggerCategorize = async () => {
    setCategorizing(true);
    setCategorizeMessage(null);
    try {
      const r = await fetch("/api/emails/categorize", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      const j = await r.json();
      setCategorizeMessage(
        `Categorized ${j.updated} of ${j.processed}.${j.processed >= 25 ? " More to go — click again." : ""}`
      );
      load();
    } catch (e: any) {
      setCategorizeMessage(`Error: ${e.message}`);
    } finally {
      setCategorizing(false);
    }
  };

  const triggerTriage = async () => {
    setTriaging(true);
    setTriageMessage(null);
    try {
      const r = await fetch("/api/emails/triage", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      const j = await r.json();
      setTriageMessage(
        `Triaged ${j.processed} (${j.rules_only} by rules, ${j.ai_pass} via AI).${j.processed >= 40 ? " More to go — click again." : ""}`
      );
      load();
    } catch (e: any) {
      setTriageMessage(`Error: ${e.message}`);
    } finally {
      setTriaging(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/dashboard" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">Inbox</span>
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

      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8">
        <div className="flex items-baseline justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="label-section mb-1">Synced from Gmail / Outlook</div>
            <h1 className="heading-display text-4xl text-[var(--ink)]">Inbox</h1>
            <p className="text-sm text-[var(--ink-muted)] mt-1">
              {totalCount.toLocaleString()} message{totalCount === 1 ? "" : "s"}
              {uncategorizedCount > 0
                ? ` · ${uncategorizedCount} not yet sorted`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setComposeDefaults({});
                setComposeOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
            >
              <Pencil className="w-4 h-4" strokeWidth={1.5} />
              Compose
            </button>
            <button
              onClick={triggerCategorize}
              disabled={categorizing || uncategorizedCount === 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition disabled:opacity-40"
              title={uncategorizedCount === 0 ? "No backlog" : "Run AI categorize on uncategorized emails"}
            >
              {categorizing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              ) : (
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              {categorizing ? "Sorting…" : "Sort with AI"}
            </button>
            <button
              onClick={triggerTriage}
              disabled={triaging || untriagedCount <= 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition disabled:opacity-40"
              title={untriagedCount <= 0 ? "No backlog" : "Score urgency on untriaged emails"}
            >
              {triaging ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              ) : (
                <Flame className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              {triaging ? "Triaging…" : "Triage"}
            </button>
          </div>
        </div>

        {(categorizeMessage || triageMessage) && (
          <div className="mb-4 space-y-2">
            {categorizeMessage && (
              <div className="px-3 py-2 text-xs text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-[4px]">
                {categorizeMessage}
              </div>
            )}
            {triageMessage && (
              <div className="px-3 py-2 text-xs text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-[4px]">
                {triageMessage}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        )}

        {/* Urgency filter row */}
        {facets.urgency.length > 0 && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mr-1">
              Urgency
            </span>
            {facets.urgency.map((f) => {
              const k = f.key as Urgency;
              return (
                <button
                  key={k}
                  onClick={() =>
                    setActiveUrgency(activeUrgency === k ? null : k)
                  }
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                    activeUrgency === k
                      ? "bg-[var(--ink)] text-[var(--canvas)] border-[var(--ink)]"
                      : URGENCY_CHIP[k]
                  }`}
                >
                  {URGENCY_LABEL[k]} ({f.count})
                </button>
              );
            })}
            {untriagedCount > 0 && (
              <span className="text-[11px] text-[var(--ink-subtle)] ml-1">
                · {untriagedCount} untriaged
              </span>
            )}
          </div>
        )}

        {/* Category filter chips */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mr-1">
            Category
          </span>
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              activeCategory === null
                ? "bg-[var(--ink)] text-[var(--canvas)] border-[var(--ink)]"
                : "bg-[var(--canvas)] text-[var(--ink-muted)] border-[var(--rule)] hover:text-[var(--ink)]"
            }`}
          >
            All ({totalCount})
          </button>
          {facets.categories.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveCategory(f.key === activeCategory ? null : f.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                activeCategory === f.key
                  ? "bg-[var(--ink)] text-[var(--canvas)] border-[var(--ink)]"
                  : chipClass(f.key)
              }`}
            >
              {f.key} ({f.count})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-4 relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]"
            strokeWidth={1.5}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search subject / from / preview…"
            className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] pl-9 pr-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
          />
        </div>

        {/* Two-pane: list | detail */}
        <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-6">
          {/* List */}
          <div className="card-flat overflow-hidden lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto">
            {items === null ? (
              <div className="flex items-center justify-center py-24">
                <Loader2
                  className="w-6 h-6 animate-spin text-[var(--ink-subtle)]"
                  strokeWidth={1.5}
                />
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center">
                <Inbox
                  className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-3"
                  strokeWidth={1.5}
                />
                <p className="text-sm text-[var(--ink-muted)]">
                  No messages match. Sync Gmail/Outlook from settings if your
                  inbox feels empty here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--rule)]">
                {items.map((r) => (
                  <li
                    key={r.id}
                    onClick={() => openEmail(r.id)}
                    className={`py-3 px-4 cursor-pointer transition relative ${
                      selected?.id === r.id
                        ? "bg-[var(--canvas-subtle)]"
                        : "hover:bg-[var(--canvas-subtle)]"
                    }`}
                  >
                    {r.urgency_level === "urgent" && (
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--danger)]"
                        aria-hidden
                      />
                    )}
                    {r.urgency_level === "needs_attention" && (
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--flag)]"
                        aria-hidden
                      />
                    )}
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-xs text-[var(--ink-muted)] truncate">
                        {r.from_addr}
                      </span>
                      <span className="text-[10px] mono text-[var(--ink-subtle)] shrink-0">
                        {fmt(r.received_at)}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-[var(--ink)] truncate mb-0.5 flex items-center gap-1.5">
                      {r.urgency_level === "urgent" && (
                        <AlertTriangle
                          className="w-3.5 h-3.5 text-[var(--danger)] shrink-0"
                          strokeWidth={1.75}
                        />
                      )}
                      <span className="truncate">{r.subject || "(no subject)"}</span>
                    </div>
                    <div className="text-[11px] text-[var(--ink-subtle)] truncate">
                      {r.snippet || "—"}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      {r.urgency_level && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${URGENCY_CHIP[r.urgency_level]}`}
                        >
                          <Flame className="w-2.5 h-2.5" strokeWidth={1.5} />
                          {URGENCY_LABEL[r.urgency_level]}
                        </span>
                      )}
                      {r.category && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${chipClass(r.category)}`}
                        >
                          <Tag className="w-2.5 h-2.5" strokeWidth={1.5} />
                          {r.category}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Detail */}
          <div className="card-flat overflow-hidden lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto">
            {!selected ? (
              <div className="py-24 text-center">
                <Mail
                  className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-3"
                  strokeWidth={1.5}
                />
                <p className="text-sm text-[var(--ink-muted)]">
                  Pick a message to read.
                </p>
              </div>
            ) : (
              <div className="p-5">
                <div className="mb-4">
                  <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
                    {selected.direction}
                  </div>
                  <h2 className="heading-display text-2xl text-[var(--ink)] mb-2">
                    {selected.subject || "(no subject)"}
                  </h2>
                  <div className="text-xs text-[var(--ink-muted)] space-y-0.5">
                    <div>
                      <span className="text-[var(--ink-subtle)]">From:</span>{" "}
                      {selected.from_addr}
                    </div>
                    {selected.to_addrs && selected.to_addrs.length > 0 && (
                      <div>
                        <span className="text-[var(--ink-subtle)]">To:</span>{" "}
                        {selected.to_addrs.join(", ")}
                      </div>
                    )}
                    <div>
                      <span className="text-[var(--ink-subtle)]">Date:</span>{" "}
                      {fmt(selected.received_at)}
                    </div>
                  </div>
                </div>

                {/* Linked entities */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  {selected.urgency_level && (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${URGENCY_CHIP[selected.urgency_level]}`}
                    >
                      <Flame className="w-2.5 h-2.5" strokeWidth={1.5} />
                      {URGENCY_LABEL[selected.urgency_level]}
                    </span>
                  )}
                  {selected.category && (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${chipClass(selected.category)}`}
                    >
                      <Tag className="w-2.5 h-2.5" strokeWidth={1.5} />
                      {selected.category}
                      {selected.category_confidence != null &&
                        selected.category_confidence < 0.6 && (
                          <span className="opacity-60">
                            ?
                          </span>
                        )}
                    </span>
                  )}
                  {selected.contact && (
                    <EntityAsk
                      kind="contact"
                      id={selected.contact.id}
                      label={selected.contact.name || selected.contact.email || "Contact"}
                    >
                      <Link
                        href={`/client-details-overview${
                          selected.contact.name
                            ? `?contact=${encodeURIComponent(selected.contact.name)}`
                            : ""
                        }`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] transition"
                      >
                        <User className="w-2.5 h-2.5" strokeWidth={1.5} />
                        {selected.contact.name || selected.contact.email}
                      </Link>
                    </EntityAsk>
                  )}
                  {selected.property && (
                    <EntityAsk
                      kind="property"
                      id={selected.property.id}
                      label={selected.property.address_line1 || "Property"}
                    >
                      <Link
                        href={`/properties/${selected.property.id}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] transition"
                      >
                        <Home className="w-2.5 h-2.5" strokeWidth={1.5} />
                        {selected.property.address_line1}
                      </Link>
                    </EntityAsk>
                  )}
                </div>

                {/* Body */}
                {selected.body_html ? (
                  <div
                    className="prose prose-sm max-w-none text-[var(--ink)]"
                    style={{ wordBreak: "break-word" }}
                    dangerouslySetInnerHTML={{ __html: selected.body_html }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-[var(--ink)] leading-relaxed font-sans">
                    {selected.body_text || selected.snippet || "(no body)"}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ComposeDrawer
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        defaultTo={composeDefaults.to}
        defaultSubject={composeDefaults.subject}
      />
    </div>
  );
}
