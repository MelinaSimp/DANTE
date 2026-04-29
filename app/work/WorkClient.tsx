"use client";

// WorkClient — the unified work queue surface. Renders rows of
// WorkItem grouped by urgency (Overdue / Today / This week / Later)
// with type filter pills on top. Each row has inline actions
// (approve / snooze / dismiss / open) that hit /api/work/[id]/action.
//
// The point of this surface is organizational: one place to see and
// resolve the day's work, regardless of whose contact it's about.
// People are chips; the work-unit is the row.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Bell,
  ShieldAlert,
  CalendarClock,
  FileText,
  Users,
  Check,
  X,
  Send,
  Pause,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Home,
  ClipboardCheck,
} from "lucide-react";
import { useAssistantName } from "@/components/dante/AssistantNameProvider";

type WorkKind =
  | "renewal"
  | "draft"
  | "scheduled"
  | "flag"
  | "stale"
  | "stuck_deal"
  | "review_due";
type Urgency = "overdue" | "today" | "this_week" | "later";

interface Chip {
  label: string;
  tone?: "default" | "warn" | "danger";
}

interface WorkItem {
  id: string;
  kind: WorkKind;
  urgency: Urgency;
  title: string;
  deadline: string | null;
  chips: Chip[];
  stake: string;
  href: string;
  actions: Array<"approve" | "snooze" | "dismiss" | "open">;
  preview?: string;
}

const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: "Overdue",
  today: "Today",
  this_week: "This week",
  later: "Later",
};

const URGENCY_ORDER: Urgency[] = ["overdue", "today", "this_week", "later"];

const KIND_ICON: Record<WorkKind, React.ComponentType<any>> = {
  renewal: CalendarClock,
  draft: Bell,
  scheduled: Clock,
  flag: ShieldAlert,
  stale: Users,
  stuck_deal: Home,
  review_due: ClipboardCheck,
};

const KIND_LABEL: Record<WorkKind, string> = {
  renewal: "Renewal",
  draft: "Draft",
  scheduled: "Scheduled",
  flag: "Compliance",
  stale: "Stale",
  stuck_deal: "Stuck deal",
  review_due: "Review due",
};

type Filter = WorkKind | "all";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "stuck_deal", label: "Deals" },
  { value: "review_due", label: "Reviews" },
  { value: "renewal", label: "Renewals" },
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "flag", label: "Compliance" },
  { value: "stale", label: "Stale" },
];

function fmtDeadline(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = Math.round((d.getTime() - Date.now()) / 86400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return `in ${days}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function WorkClient() {
  const router = useRouter();
  const assistantName = useAssistantName();
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/work/queue", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      const j = await r.json();
      setItems(Array.isArray(j) ? j : []);
    } catch (e: any) {
      setError(e.message || "Failed to load");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (!items) return [];
    if (filter === "all") return items;
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  const grouped = useMemo(() => {
    const byUrg = new Map<Urgency, WorkItem[]>();
    for (const u of URGENCY_ORDER) byUrg.set(u, []);
    for (const it of visible) byUrg.get(it.urgency)!.push(it);
    return URGENCY_ORDER.map((u) => ({ urgency: u, items: byUrg.get(u)! }))
      .filter((g) => g.items.length > 0);
  }, [visible]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: items?.length || 0,
      renewal: 0,
      draft: 0,
      scheduled: 0,
      flag: 0,
      stale: 0,
      stuck_deal: 0,
      review_due: 0,
    };
    for (const it of items || []) c[it.kind]++;
    return c;
  }, [items]);

  const act = useCallback(
    async (id: string, action: "approve" | "snooze" | "dismiss") => {
      setActingIds((prev) => new Set(prev).add(id));
      try {
        const r = await fetch(`/api/work/${encodeURIComponent(id)}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "Action failed");
        }
        // Optimistic remove on approve / dismiss; for snooze, just
        // refetch since the urgency may shift the row to another bucket.
        if (action === "snooze") {
          await load();
        } else {
          setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      } catch (e: any) {
        setError(e.message || "Action failed");
      } finally {
        setActingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [load],
  );

  const bulkAct = async (action: "approve" | "snooze" | "dismiss") => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    if (
      action === "dismiss" &&
      !confirm(`Dismiss ${ids.length} item${ids.length === 1 ? "" : "s"}?`)
    )
      return;
    // Run sequentially so a failure doesn't orphan partial state.
    for (const id of ids) {
      const item = items?.find((i) => i.id === id);
      if (item && item.actions.includes(action)) {
        await act(id, action);
      }
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/dashboard" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">Work</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs text-[var(--ink-muted)] transition"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
              Refresh
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <div className="mb-8">
          <div className="label-section mb-1">Everything that needs doing</div>
          <h1 className="heading-display text-4xl text-[var(--ink)]">Work</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-xl">
            One queue across renewals, drafts, scheduled sends, compliance
            flags, and stale relationships. Sorted by urgency, organised by
            type — not by person. {assistantName} keeps it fed.
          </p>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        )}

        {/* Filter pills */}
        <div className="flex items-center gap-1 flex-wrap mb-6">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            const count = counts[f.value];
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition border"
                style={{
                  background: active ? "var(--ink)" : "transparent",
                  color: active ? "var(--canvas)" : "var(--ink-muted)",
                  borderColor: active ? "var(--ink)" : "var(--rule)",
                }}
              >
                {f.label}
                {count > 0 && (
                  <span
                    className="text-[10px] mono"
                    style={{
                      color: active ? "var(--canvas)" : "var(--ink-subtle)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="mb-4 flex items-center gap-3 px-4 py-2.5 rounded-[6px] bg-[var(--ink)] text-[var(--canvas)] text-xs">
            <span className="font-medium">
              {selected.size} selected
            </span>
            <button
              onClick={() => bulkAct("approve")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-[var(--canvas)]/10 hover:bg-[var(--canvas)]/20 transition"
            >
              <Send className="w-3 h-3" strokeWidth={1.5} />
              Approve
            </button>
            <button
              onClick={() => bulkAct("snooze")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-[var(--canvas)]/10 hover:bg-[var(--canvas)]/20 transition"
            >
              <Pause className="w-3 h-3" strokeWidth={1.5} />
              Snooze 3d
            </button>
            <button
              onClick={() => bulkAct("dismiss")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-[var(--canvas)]/10 hover:bg-[var(--canvas)]/20 transition"
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
              Dismiss
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setSelected(new Set())}
              className="text-[10px] mono uppercase tracking-wider opacity-70 hover:opacity-100"
            >
              Clear
            </button>
          </div>
        )}

        {/* Body */}
        {items === null ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} />
          </div>
        ) : grouped.length === 0 ? (
          <div className="card-flat py-16 text-center">
            <CheckCircle2 className="w-8 h-8 text-[var(--verified)] mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-[var(--ink)] font-medium mb-1">
              Nothing on the queue.
            </p>
            <p className="text-xs text-[var(--ink-muted)]">
              {filter === "all"
                ? "Inbox zero — enjoy it."
                : "Nothing in this filter. Try a different one."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map((g) => (
              <section key={g.urgency}>
                <div className="flex items-baseline gap-3 mb-3">
                  <h2 className="text-xs mono uppercase tracking-wider text-[var(--ink-muted)]">
                    {URGENCY_LABEL[g.urgency]}
                  </h2>
                  <span className="text-[11px] text-[var(--ink-subtle)] mono">
                    {g.items.length}
                  </span>
                </div>
                <ul className="card-flat overflow-hidden divide-y divide-[var(--rule)]">
                  {g.items.map((it) => (
                    <Row
                      key={it.id}
                      item={it}
                      acting={actingIds.has(it.id)}
                      selected={selected.has(it.id)}
                      expanded={expanded.has(it.id)}
                      onToggleSelect={() => toggleSelect(it.id)}
                      onToggleExpand={() => toggleExpand(it.id)}
                      onAct={(a) => act(it.id, a)}
                      onOpen={() => router.push(it.href)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  item,
  acting,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
  onAct,
  onOpen,
}: {
  item: WorkItem;
  acting: boolean;
  selected: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onAct: (a: "approve" | "snooze" | "dismiss") => void;
  onOpen: () => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const overdue = item.urgency === "overdue";
  const canBulk = item.actions.some((a) =>
    ["approve", "snooze", "dismiss"].includes(a),
  );

  return (
    <li
      className="px-4 py-3 transition"
      style={{
        background: selected ? "var(--canvas-subtle)" : "transparent",
      }}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox — only for items with at least one bulk-able action */}
        <div className="shrink-0 pt-1">
          {canBulk ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="cursor-pointer"
            />
          ) : (
            <div className="w-3.5 h-3.5" />
          )}
        </div>

        {/* Kind icon */}
        <div
          className="shrink-0 mt-0.5 w-7 h-7 rounded-[4px] border flex items-center justify-center"
          style={{
            borderColor: overdue ? "var(--danger)" : "var(--rule)",
            background: overdue ? "var(--danger-soft)" : "var(--canvas)",
          }}
        >
          <Icon
            className="w-3.5 h-3.5"
            strokeWidth={1.5}
            style={{
              color: overdue ? "var(--danger)" : "var(--ink-muted)",
            }}
          />
        </div>

        {/* Title + chips */}
        <div className="flex-1 min-w-0">
          <button
            onClick={onToggleExpand}
            className="w-full text-left"
            title={expanded ? "Collapse" : "Show details"}
          >
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-medium text-[var(--ink)]">
                {item.title}
              </span>
              <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                {KIND_LABEL[item.kind]}
              </span>
              {item.deadline && (
                <span
                  className="text-[10px] mono"
                  style={{
                    color: overdue ? "var(--danger)" : "var(--ink-muted)",
                  }}
                >
                  · {fmtDeadline(item.deadline)}
                </span>
              )}
              <span className="text-[10px] text-[var(--ink-subtle)] ml-auto inline-flex items-center gap-0.5">
                {expanded ? (
                  <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
                ) : (
                  <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                )}
              </span>
            </div>
            {item.chips.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {item.chips.map((c, i) => {
                  const tone = c.tone || "default";
                  const bg =
                    tone === "danger"
                      ? "var(--danger-soft)"
                      : tone === "warn"
                      ? "var(--canvas-subtle)"
                      : "var(--canvas-subtle)";
                  const fg =
                    tone === "danger"
                      ? "var(--danger)"
                      : "var(--ink-muted)";
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center px-1.5 py-0.5 rounded-[3px] border border-[var(--rule)] text-[10px] mono uppercase tracking-wider"
                      style={{ background: bg, color: fg }}
                    >
                      {c.label}
                    </span>
                  );
                })}
              </div>
            )}
          </button>

          {/* Expanded preview + stake */}
          {expanded && (
            <div className="mt-2 pl-1 space-y-1.5 text-xs text-[var(--ink-muted)] border-l-2 border-[var(--rule)] ml-1">
              <div className="pl-3">
                <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-0.5">
                  If ignored
                </div>
                <div className="text-[var(--ink-muted)]">{item.stake}</div>
              </div>
              {item.preview && (
                <div className="pl-3">
                  <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-0.5">
                    Preview
                  </div>
                  <div
                    className="text-[var(--ink-muted)]"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden",
                    }}
                  >
                    {item.preview}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Inline actions */}
        <div className="shrink-0 flex items-center gap-1">
          {acting && (
            <Loader2
              className="w-3.5 h-3.5 animate-spin text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
          )}
          {!acting && item.actions.includes("approve") && (
            <button
              onClick={() => onAct("approve")}
              className="inline-flex items-center justify-center w-7 h-7 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 transition"
              title="Approve & schedule"
            >
              <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
          {!acting && item.actions.includes("snooze") && (
            <button
              onClick={() => onAct("snooze")}
              className="inline-flex items-center justify-center w-7 h-7 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
              title="Snooze 3 days"
            >
              <Pause className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
          {!acting && item.actions.includes("dismiss") && (
            <button
              onClick={() => onAct("dismiss")}
              className="inline-flex items-center justify-center w-7 h-7 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--danger-soft)] text-[var(--ink-muted)] hover:text-[var(--danger)] transition"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
          <button
            onClick={onOpen}
            className="inline-flex items-center justify-center w-7 h-7 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
            title="Open source"
          >
            <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </li>
  );
}
