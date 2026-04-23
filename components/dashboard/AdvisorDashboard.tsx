"use client";

// Harvey-styled advisor dashboard — the default landing for authenticated
// users. Four sections mirror how an advisor actually starts their day:
//
//   • Today            — next calendar items with "prep" links
//   • Awaiting review  — compliance flags + drafts pending sign-off
//   • Recent           — latest call recordings with audit chips
//   • Needs attention  — relationship signals (clients going quiet, etc.)
//
// The earlier "Flagged" section advertised RMD / age-band / suitability
// kinds that didn't exist — only the "stale" signal was real. Rather
// than ship three empty compliance promises we can't honour, the
// section now reflects what it actually does: surface relationships at
// risk. Real compliance flags will come back under their own section
// once custodian data is wired.
//
// The custodian/AUM integration was removed: a real Schwab/Fidelity/
// Altruist integration is weeks of OAuth + approval work per provider,
// and a mock-only "Seed demo data" prompt was more confusing than
// useful. If that layer comes back it should land as a separate
// concern with a real driver, not a stub.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { pickGreeting, pickSubtitle } from "@/lib/dashboard/greetings";
import DanteGateLink from "@/components/dante/DanteGateLink";
import {
  ArrowUpRight,
  ShieldCheck,
  FileCheck2,
  CalendarClock,
  AlertTriangle,
  LogOut,
  Sparkles,
  X,
  Check,
} from "lucide-react";

type Meeting = {
  id: string;
  contactName: string;
  scheduledAt: string;
  serviceType: string;
};

type CallNote = {
  id: string;
  contact_id: string;
  contact_name: string | null;
  created_at: string;
  body: string;
  has_audit: boolean;
};

// The dashboard only surfaces one flag kind today — "stale", meaning a
// client we haven't touched in 60 days. RMD / age-band / suitability
// would require custodian data (DOB, account_type, balance) that Drift
// doesn't have yet. Added back when that data lands.
type Flag = {
  id: string;
  kind: "stale";
  client: string;
  detail: string;
  dueAt?: string | null;
};

type DashboardData = {
  advisorName: string;
  workspaceName: string;
  // Only true when the logged-in user is a platform superadmin
  // (per hasSuperadminAccess). Used to reveal the Admin nav item.
  isSuperadmin?: boolean;
  // Subset of FeatureId — what this workspace is entitled to. Links and
  // sections missing from this list are hidden from the dashboard so the
  // customer never sees something they can't actually use.
  features: string[];
  today: Meeting[];
  awaitingReview: number;
  recentCalls: CallNote[];
  flagged: Flag[];
  stats: {
    clients: number;
    calls7d: number;
    documents: number;
    verifiedPct: number | null;
  };
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeOnly(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 7 && diff > 0) return `in ${diff}d`;
  if (diff < 0) return `${-diff}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AdvisorDashboard({ data }: { data: DashboardData }) {
  const router = useRouter();

  const firstName = useMemo(
    () => data.advisorName.split(" ")[0] || "there",
    [data.advisorName]
  );

  // Greeting + subtitle rotate from pools in lib/dashboard/greetings
  // seeded on (firstName, today's date). Same copy all day, fresh
  // tomorrow. useMemo so the hash doesn't recompute on every render.
  const greeting = useMemo(() => pickGreeting(firstName), [firstName]);
  // Some greetings already end in their own punctuation ("Long day?",
  // "Not done yet?"). Appending ", Adharsh." to those yields "Long
  // day?, Adharsh." — swap the comma for a space in that case.
  const greetingSeparator = /[?!.]$/.test(greeting) ? " " : ", ";
  const hasCompliance = data.features.includes("compliance_scanner");
  const meetings = data.today.length;
  const review = hasCompliance ? data.awaitingReview : 0;
  const subtitle = useMemo(
    () => pickSubtitle(firstName, meetings, review),
    [firstName, meetings, review],
  );

  return (
    <div className="min-h-screen bg-white text-[#151515]">
      {/* Top bar — kept minimal. Logo left, sign-out right. */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 md:px-10 py-4 bg-white border-b border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <img
            src="/brand/logo-circle.png"
            alt="Drift"
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="text-sm font-medium tracking-tight">Drift</span>
          <span className="text-[var(--ink-subtle)]">·</span>
          <span className="text-xs mono text-[var(--ink-muted)]">
            {data.workspaceName}
          </span>
        </div>
        <nav className="flex items-center gap-1">
          <Link
            href="/client-details-overview"
            className="px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            Clients
          </Link>
          <Link
            href="/calendar"
            className="px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            Calendar
          </Link>
          <Link
            href="/email"
            className="px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            Email
          </Link>
          <Link
            href="/agent"
            className="px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            Agent
          </Link>
          {data.features.includes("dante") && (
            // Dante gets a distinct visual treatment: the double-gate
            // mark + passing-through animation make entering Dante feel
            // like crossing a threshold instead of clicking a nav link.
            // Every other nav item here is plain text — that's the
            // point. Dante is meant to stand out.
            <DanteGateLink variant="nav-primary" />
          )}
          <Link
            href="/settings"
            className="px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            Settings
          </Link>
          {/* Superadmin-only: the admin console lives at /admin and is
              always gated server-side too — this is purely a nav hint. */}
          {data.isSuperadmin && (
            <Link
              href="/admin"
              className="px-3 py-1.5 text-sm text-[var(--accent)] hover:text-[var(--ink)] transition"
            >
              Admin
            </Link>
          )}
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/auth");
            }}
            className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-12 md:py-16">
        {/* Editorial header */}
        <div className="mb-12">
          <div className="label-section mb-3">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <h1 className="heading-display text-5xl md:text-6xl mb-3">
            {greeting}{greetingSeparator}{firstName}.
          </h1>
          <p className="prose-body text-[var(--ink-muted)] max-w-2xl">
            {subtitle}
          </p>
        </div>

        {/* Stat strip — stripped down, no giant cards. Verified % is
            only meaningful when the grounded_summaries feature is on;
            otherwise we drop the column and reflow 4→3. */}
        {(() => {
          const showVerified = data.features.includes("grounded_summaries");
          const cols = showVerified ? "md:grid-cols-4" : "md:grid-cols-3";
          return (
            <div
              className={`grid grid-cols-2 ${cols} gap-px bg-[var(--rule)] mb-12 rounded-md overflow-hidden border border-[var(--rule)]`}
            >
              <StatCell
                label="Clients"
                value={data.stats.clients.toString()}
                href="/client-details-overview"
              />
              <StatCell
                label="Calls · 7d"
                value={data.stats.calls7d.toString()}
              />
              <StatCell
                label="Documents"
                value={data.stats.documents.toString()}
                href="/client-details-overview"
              />
              {showVerified && (
                <StatCell
                  label="Verified"
                  value={
                    data.stats.verifiedPct !== null
                      ? `${data.stats.verifiedPct}%`
                      : "—"
                  }
                  hint="citation-grounded"
                />
              )}
            </div>
          );
        })()}

        {/* Today / Awaiting — second column collapses when the
            compliance_scanner feature is off; Today then spans full
            width so the dashboard doesn't look half-empty. */}
        {(() => {
          const hasCompliance = data.features.includes("compliance_scanner");
          const gridCols = hasCompliance ? "md:grid-cols-2" : "md:grid-cols-1";
          return (
            <section className={`grid grid-cols-1 ${gridCols} gap-10 mb-16`}>
              <DashSection
                label="Today"
                icon={<CalendarClock className="w-3.5 h-3.5" />}
              >
                {data.today.length === 0 ? (
                  <EmptyNote>No meetings scheduled.</EmptyNote>
                ) : (
                  <ul className="divide-y divide-[var(--rule)] border-t border-b border-[var(--rule)]">
                    {data.today.map((m) => (
                      <li key={m.id} className="py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="text-[15px] font-medium mb-0.5">
                              {m.contactName}
                            </div>
                            <div className="text-xs text-[var(--ink-muted)] mono">
                              {formatTimeOnly(m.scheduledAt)} · {m.serviceType}
                            </div>
                          </div>
                          <Link
                            href={`/client-details-overview?contact=${encodeURIComponent(
                              m.contactName
                            )}`}
                            className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                          >
                            Prep
                            <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </DashSection>

              {hasCompliance && (
                <DashSection
                  label="Awaiting your review"
                  icon={<ShieldCheck className="w-3.5 h-3.5" />}
                >
                  {data.awaitingReview === 0 ? (
                    <EmptyNote>Queue is clear.</EmptyNote>
                  ) : (
                    <div className="py-4 border-t border-b border-[var(--rule)]">
                      <div className="flex items-baseline gap-3">
                        <div className="heading-display text-4xl">
                          {data.awaitingReview}
                        </div>
                        <div className="text-sm text-[var(--ink-muted)]">
                          item{data.awaitingReview === 1 ? "" : "s"} pending
                          compliance review
                        </div>
                      </div>
                      <Link
                        href="/compliance/queue"
                        className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                      >
                        Open queue
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </div>
                  )}
                </DashSection>
              )}
            </section>
          );
        })()}

        {/* Recent calls */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="label-section">Recent calls</span>
              <FileCheck2 className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
            </div>
          </div>
          {data.recentCalls.length === 0 ? (
            <EmptyNote>No call recordings yet.</EmptyNote>
          ) : (
            <ul className="divide-y divide-[var(--rule)] border-t border-b border-[var(--rule)]">
              {data.recentCalls.map((c) => (
                <li key={c.id} className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <div className="text-[15px] font-medium truncate">
                          {c.contact_name || "Unknown"}
                        </div>
                        <div className="text-xs mono text-[var(--ink-subtle)]">
                          {formatRelativeDate(c.created_at)}
                        </div>
                      </div>
                      <div className="text-sm text-[var(--ink-muted)] line-clamp-1">
                        {c.body.replace(/^📞 Call with [^\n]*\n?/, "").slice(0, 180)}
                      </div>
                    </div>
                    {c.has_audit && (
                      <Link
                        href={`/client-details-overview?contact=${c.contact_id}&audit=${c.id}`}
                        className="chip-citation hover:bg-[var(--accent)] hover:text-white transition whitespace-nowrap"
                      >
                        <FileCheck2 className="w-3 h-3" />
                        View audit
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Agent outputs — pending recommendations/insights from the
            autonomous roster. Click the card to jump to where the advice
            lives; Approve/Dismiss acts inline. Outputs with a
            scheduled_for date in the past are filtered client-side ("if a
            selected date for a recommendation is passed, the
            recommendation should fall from the dashboard"). */}
        <AgentOutputsSection />

        {/* Needs attention — clients going quiet. Not compliance; this
            is a relationship-at-risk signal ("no activity in 60 days").
            Kept honest: one real signal instead of four advertised ones. */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="label-section">Needs attention</span>
              <AlertTriangle className="w-3.5 h-3.5 text-[var(--flag)]" />
            </div>
            <span className="text-xs text-[var(--ink-subtle)]">
              Clients going quiet
            </span>
          </div>
          {data.flagged.length === 0 ? (
            <EmptyNote>No clients need attention right now.</EmptyNote>
          ) : (
            <ul className="divide-y divide-[var(--rule)] border-t border-b border-[var(--rule)]">
              {data.flagged.map((f) => (
                <li key={f.id} className="py-4 flex items-start gap-4">
                  <span className="chip-flag mt-0.5 shrink-0">quiet</span>
                  <div className="flex-1">
                    <div className="text-[15px] font-medium">{f.client}</div>
                    <div className="text-sm text-[var(--ink-muted)]">
                      {f.detail}
                    </div>
                    {f.dueAt && (
                      <div className="text-xs mono text-[var(--ink-subtle)] mt-0.5">
                        {formatDateTime(f.dueAt)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </div>
  );
}

/* ---------------- Presentational primitives ---------------- */

function StatCell({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string;
  href?: string;
  hint?: string;
}) {
  const body = (
    <div className="bg-white px-5 py-4 h-full hover:bg-[var(--canvas-subtle)] transition">
      <div className="label-section mb-2">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="heading-display text-3xl">{value}</div>
        {hint && (
          <div className="text-[10px] mono text-[var(--ink-subtle)] uppercase tracking-wider">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function DashSection({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="label-section">{label}</span>
        <span className="text-[var(--ink-muted)]">{icon}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-6 border-t border-b border-[var(--rule)] text-sm text-[var(--ink-subtle)] italic">
      {children}
    </div>
  );
}

/* ---------------- Agent outputs ---------------- */

type AgentOutput = {
  id: string;
  agent_id: string;
  title: string;
  type: string;
  summary: string;
  review_status: string;
  linked_client: string | null;
  scheduled_for: string | null;
  created_at: string;
  wm_agent_definitions?: { name: string; icon: string } | null;
};

// Type → where the advice lives. Insights/alerts surface compliance
// issues; recommendations/reports are usually follow-up moves the
// advisor takes in notes. Everything links to the client overview
// scoped by name (the existing routing pattern).
function outputHref(o: AgentOutput): string | null {
  if (!o.linked_client) return null;
  const contact = encodeURIComponent(o.linked_client);
  const hash =
    o.type === "insight" || o.type === "alert"
      ? "#compliance-flags"
      : "#notes";
  return `/client-details-overview?contact=${contact}${hash}`;
}

function outputKicker(o: AgentOutput): string {
  if (o.type === "insight") return "Insight";
  if (o.type === "alert") return "Alert";
  if (o.type === "recommendation") return "Recommendation";
  if (o.type === "report") return "Report";
  return o.type;
}

function AgentOutputsSection() {
  const [outputs, setOutputs] = useState<AgentOutput[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          "/api/autonomous-agents/outputs?reviewStatus=PENDING",
          { credentials: "include" }
        );
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const json = (await res.json()) as AgentOutput[];
        if (cancelled) return;
        // Filter out recommendations whose scheduled_for date has passed
        // ("If a selected date for a recommendation is passed, the
        // recommendation should fall from the dashboard").
        const now = Date.now();
        const fresh = (Array.isArray(json) ? json : []).filter((o) => {
          if (!o.scheduled_for) return true;
          return new Date(o.scheduled_for).getTime() >= now;
        });
        setOutputs(fresh);
      } catch {
        /* swallow — section just stays empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function review(id: string, review_status: "APPROVED" | "DISMISSED") {
    // Optimistic drop — the output leaves the pending list either way.
    setOutputs((prev) => prev.filter((o) => o.id !== id));
    try {
      await fetch(`/api/autonomous-agents/outputs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ review_status }),
      });
    } catch {
      /* silent — worst case the card reappears on next load */
    }
  }

  if (loading) return null;
  if (outputs.length === 0) return null;

  return (
    <section className="mb-16">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="label-section">From your agents</span>
          <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
        </div>
        <Link
          href="/agent"
          className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
        >
          Manage →
        </Link>
      </div>
      <ul className="divide-y divide-[var(--rule)] border-t border-b border-[var(--rule)]">
        {outputs.map((o) => {
          const href = outputHref(o);
          return (
            <li key={o.id} className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                      {outputKicker(o)}
                    </span>
                    {o.wm_agent_definitions?.name && (
                      <>
                        <span className="text-[var(--ink-subtle)]">·</span>
                        <span className="text-xs text-[var(--ink-muted)]">
                          {o.wm_agent_definitions.name}
                        </span>
                      </>
                    )}
                    {o.linked_client && (
                      <>
                        <span className="text-[var(--ink-subtle)]">·</span>
                        <span className="text-xs text-[var(--ink-muted)]">
                          {o.linked_client}
                        </span>
                      </>
                    )}
                    {o.scheduled_for && (
                      <span className="text-[10px] mono text-[var(--ink-subtle)] ml-auto">
                        by {formatRelativeDate(o.scheduled_for)}
                      </span>
                    )}
                  </div>
                  {href ? (
                    <Link
                      href={href}
                      className="block group"
                    >
                      <div className="text-[15px] font-medium text-[var(--ink)] group-hover:underline mb-0.5">
                        {o.title}
                      </div>
                      <div className="text-sm text-[var(--ink-muted)] line-clamp-2">
                        {o.summary}
                      </div>
                    </Link>
                  ) : (
                    <>
                      <div className="text-[15px] font-medium text-[var(--ink)] mb-0.5">
                        {o.title}
                      </div>
                      <div className="text-sm text-[var(--ink-muted)] line-clamp-2">
                        {o.summary}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => review(o.id, "APPROVED")}
                    title="Approve"
                    className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--verified)] hover:bg-[var(--verified-soft)] transition"
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => review(o.id, "DISMISSED")}
                    title="Dismiss"
                    className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
